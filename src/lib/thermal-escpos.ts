/**
 * Nota thermal: teks ESC/POS (APK Bluetooth & Web Serial), raster (cadangan
 * untuk printer yang tidak mencetak teks), dan PNG (bagikan ke Thermer dari
 * browser HP).
 *
 * Satu sumber baris (`buildThermalNotaLines`) dipakai ketiganya, supaya isi
 * nota identik apa pun jalurnya.
 */

import type { InvoiceLineItem } from "@/components/invoice/invoice-document";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { saveBlob, type SaveFileResult } from "@/lib/save-file";

/** Lebar kertas printer thermal. */
export type ThermalPaperWidth = "58" | "80";

/** Karakter per baris Font A (12×24 dot). */
export const THERMAL_COLS_BY_WIDTH: Record<ThermalPaperWidth, number> = {
  "58": 32,
  "80": 48,
};

/** Dot horizontal kepala cetak @ ~203dpi (kelipatan 8). */
export const THERMAL_DOTS_BY_WIDTH: Record<ThermalPaperWidth, number> = {
  "58": 384,
  "80": 576,
};

/** Lebar karakter Font A pada roll 58mm. */
export const THERMAL_COLS = THERMAL_COLS_BY_WIDTH["58"];

/** Dot horizontal 58mm @ ~203dpi. Harus kelipatan 8. */
export const THERMAL_DOT_WIDTH = THERMAL_DOTS_BY_WIDTH["58"];

/**
 * Lebar PNG untuk share/unduh ke Thermer POS-58.
 * Harus ≈ 384 dot (lebar kepala cetak 58mm). Gambar 576 dipotong kanan
 * oleh Thermer → nominal Rp hilang.
 */
export const THERMAL_SHARE_PNG_WIDTH = 384;

/** Baud default; banyak BT/USB murah = 9600, sebagian 115200. */
export const THERMAL_BAUD_RATE = 9600;

export const THERMAL_BAUD_FALLBACKS = [9600, 115200, 38400] as const;

export interface ThermalNotaPayment {
  amount: number;
  payment_date: string;
  method: string;
}

export interface ThermalNotaInput {
  store_name: string;
  store_address?: string;
  store_phone?: string;
  transaction_number: string;
  customer_name: string;
  payment_type: string;
  created_at: string;
  description?: string | null;
  lineItems: InvoiceLineItem[];
  customerCharges?: Array<{ name: string; amount: number }>;
  final_price: number;
  total_due?: number;
  dp_amount: number;
  status: string;
  payments: ThermalNotaPayment[];
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Baris raster per perintah GS v 0 — printer murah punya buffer kecil. */
const RASTER_BAND_ROWS = 128;

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function money(n: number): string {
  return asciiSafe(formatCurrency(n));
}

/** Tanda baca Unicode umum → padanan ASCII (sebelum sisa non-ASCII jadi "?"). */
const ASCII_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[     ]/g, " "],
  [/[‐-―−]/g, "-"],
  [/[‘’‚′]/g, "'"],
  [/[“”„″]/g, '"'],
  [/…/g, "..."],
  [/[•·]/g, "-"],
  [/×/g, "x"],
  [/[\t\r]/g, " "],
];

/**
 * Printer thermal murah memakai code page 1-byte, bukan UTF-8 — semua teks
 * diturunkan ke ASCII cetak supaya tidak muncul karakter sampah.
 */
function asciiSafe(text: string): string {
  let out = text;
  for (const [pattern, replacement] of ASCII_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

/** Bungkus per kata; kata yang lebih panjang dari satu baris dipecah, bukan dipotong. */
function wrapText(text: string, cols: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (let word of words) {
      while (word.length > cols) {
        if (current) {
          lines.push(current);
          current = "";
        }
        lines.push(word.slice(0, cols));
        word = word.slice(cols);
      }
      if (!word) continue;
      const next = current ? `${current} ${word}` : word;
      if (next.length <= cols) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

/**
 * Kiri-kanan dalam satu baris; kalau tidak muat, teks kiri dibungkus dan
 * nominal kanan turun ke baris sendiri (rata kanan) — nominal tidak pernah
 * terpotong.
 */
function pairLines(left: string, right: string, cols: number): string[] {
  const r = right.slice(0, cols);
  if (left.length + 1 + r.length <= cols) {
    return [`${left}${" ".repeat(cols - left.length - r.length)}${r}`];
  }
  const indent = left.match(/^ */)?.[0] ?? "";
  const body = wrapText(left, Math.max(cols - indent.length, 1)).map(
    (part) => `${indent}${part}`,
  );
  return [...body, r.padStart(cols)];
}

export type ThermalLineAlign = "center" | "left";

export interface ThermalLine {
  text: string;
  align: ThermalLineAlign;
  /**
   * title  = huruf ganda (lebar & tinggi) + tebal — nama toko.
   * total  = tinggi ganda + tebal — total tagihan / sisa.
   * strong = tebal.
   */
  emphasis?: "title" | "total" | "strong" | "normal";
}

/** Baris nota tanpa pad spasi untuk teks tengah (center pakai ESC a / canvas textAlign). */
export function buildThermalNotaLines(
  data: ThermalNotaInput,
  cols: number = THERMAL_COLS,
): ThermalLine[] {
  const lines: ThermalLine[] = [];
  const add = (
    text: string,
    align: ThermalLineAlign = "left",
    emphasis: ThermalLine["emphasis"] = "normal",
  ) => {
    lines.push({ text, align, emphasis });
  };
  const addWrapped = (
    text: string,
    align: ThermalLineAlign = "left",
    emphasis: ThermalLine["emphasis"] = "normal",
    width = cols,
  ) => {
    for (const part of wrapText(asciiSafe(text), width)) add(part, align, emphasis);
  };
  const addPair = (
    left: string,
    right: string,
    emphasis: ThermalLine["emphasis"] = "normal",
  ) => {
    for (const part of pairLines(asciiSafe(left), asciiSafe(right), cols)) {
      add(part, "left", emphasis);
    }
  };
  /** "Pel : nilai" — baris lanjutan menjorok sejajar nilai. */
  const addLabeled = (label: string, value: string) => {
    const indent = " ".repeat(label.length);
    wrapText(asciiSafe(value), cols - label.length).forEach((part, i) => {
      add(`${i === 0 ? label : indent}${part}`);
    });
  };
  const separator = () => add("-".repeat(cols));

  // Huruf ganda memakai 2 kolom per karakter.
  addWrapped(data.store_name, "center", "title", Math.floor(cols / 2));
  if (data.store_address) addWrapped(data.store_address, "center");
  if (data.store_phone) addWrapped(`Telp: ${data.store_phone}`, "center");
  separator();
  add("NOTA PEMBAYARAN", "center", "strong");
  addWrapped(data.transaction_number, "center");
  separator();
  addLabeled("Tgl : ", formatDate(data.created_at));
  addLabeled("Pel : ", data.customer_name);
  addLabeled("Tipe: ", data.payment_type === "CASH" ? "Cash Lunas" : "DP / UM");
  if (data.description?.trim()) {
    separator();
    add("Catatan:", "left", "strong");
    addWrapped(data.description.trim());
  }
  separator();

  const totalPaid = data.payments.reduce((s, p) => s + p.amount, 0);
  const charges = data.customerCharges || [];
  const totalDue =
    data.total_due ??
    data.final_price + charges.reduce((s, c) => s + c.amount, 0);
  const remaining = totalDue - totalPaid;

  for (const item of data.lineItems) {
    addWrapped(item.product_name, "left", "strong");
    if (item.note?.trim()) {
      for (const part of wrapText(asciiSafe(item.note.trim()), cols - 2)) {
        add(`  ${part}`);
      }
    }
    addPair(
      `  ${item.quantity} x ${money(item.unit_price)}`,
      money(item.line_total),
    );
  }

  if (charges.length > 0) {
    separator();
    for (const c of charges) addPair(c.name, money(c.amount));
  }

  separator();
  addPair("Total tagihan", money(totalDue), "total");
  if (data.payment_type === "DP") {
    addPair("DP awal", money(data.dp_amount));
  }
  addPair("Dibayar", money(totalPaid));
  if (remaining > 0) {
    addPair("Sisa", money(remaining), "total");
  } else if (data.payment_type !== "CASH") {
    add("*** LUNAS ***", "center", "strong");
  }

  if (data.payments.length > 0) {
    separator();
    add("Riwayat bayar:");
    for (const p of data.payments) {
      addPair(`${formatDate(p.payment_date)} ${p.method}`, money(p.amount));
    }
  }

  separator();
  add("Terima kasih!", "center");
  addWrapped(data.status, "center");
  return lines;
}

/** Cara kirim ke printer: teks ESC/POS (bawaan) atau gambar raster (cadangan). */
export type ThermalPrintMode = "text" | "image";

/** Baris tes cetak: garis penggaris selebar kertas untuk cek lebar kertas. */
export function buildThermalTestLines(
  paper: ThermalPaperWidth,
  mode: ThermalPrintMode,
): ThermalLine[] {
  const cols = THERMAL_COLS_BY_WIDTH[paper];
  const ruler = Array.from({ length: cols }, (_, i) => String((i + 1) % 10)).join("");
  return [
    { text: "TES PRINTER", align: "center", emphasis: "title" },
    { text: `Kertas ${paper}mm - mode ${mode === "text" ? "teks" : "gambar"}`, align: "center" },
    { text: "-".repeat(cols), align: "left" },
    { text: "Penggaris harus pas 1 baris:", align: "left" },
    { text: ruler, align: "left" },
    ...pairLines("Total tagihan", "Rp 1.250.000", cols).map(
      (text): ThermalLine => ({ text, align: "left", emphasis: "total" }),
    ),
    { text: "-".repeat(cols), align: "left" },
    { text: "Huruf tebal & normal terbaca?", align: "left", emphasis: "strong" },
    { text: "Kalau ya, printer siap dipakai.", align: "left" },
  ];
}

/** Kirim baris ke printer sesuai mode. */
export function buildThermalPayload(
  rows: ThermalLine[],
  paper: ThermalPaperWidth,
  mode: ThermalPrintMode,
): Uint8Array {
  return mode === "image"
    ? renderLinesRaster(rows, paper)
    : renderLinesEscPos(rows);
}

/** Nota siap kirim ke printer (Bluetooth APK). */
export function buildThermalNotaPayload(
  data: ThermalNotaInput,
  paper: ThermalPaperWidth,
  mode: ThermalPrintMode,
): Uint8Array {
  return buildThermalPayload(
    buildThermalNotaLines(data, THERMAL_COLS_BY_WIDTH[paper]),
    paper,
    mode,
  );
}

/**
 * Teks ESC/POS — tajam (font bawaan printer) dan cepat. Tengah via ESC a,
 * huruf besar via GS !, tebal via ESC E.
 */
export function buildThermalNotaEscPos(
  data: ThermalNotaInput,
  paper: ThermalPaperWidth = "58",
): Uint8Array {
  return renderLinesEscPos(
    buildThermalNotaLines(data, THERMAL_COLS_BY_WIDTH[paper]),
  );
}

function renderLinesEscPos(rows: ThermalLine[]): Uint8Array {
  const chunks: Uint8Array[] = [
    new Uint8Array([ESC, 0x40]), // init
    new Uint8Array([ESC, 0x74, 0x00]), // code page PC437
    new Uint8Array([ESC, 0x32]), // jarak baris bawaan
  ];

  for (const row of rows) {
    const size =
      row.emphasis === "title" ? 0x11 : row.emphasis === "total" ? 0x01 : 0x00;
    const bold = row.emphasis && row.emphasis !== "normal" ? 0x01 : 0x00;
    chunks.push(
      new Uint8Array([
        ESC, 0x61, row.align === "center" ? 0x01 : 0x00,
        GS, 0x21, size,
        ESC, 0x45, bold,
      ]),
    );
    const text = asciiSafe(row.text);
    const bytes = new Uint8Array(text.length + 1);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    bytes[text.length] = LF;
    chunks.push(bytes);
  }

  chunks.push(
    new Uint8Array([ESC, 0x61, 0x00, GS, 0x21, 0x00, ESC, 0x45, 0x00]),
    new Uint8Array([ESC, 0x64, 0x04]), // dorong kertas melewati pisau sobek
    new Uint8Array([GS, 0x56, 0x01]), // potong (diabaikan printer tanpa pisau)
  );
  return concatBytes(chunks);
}

/**
 * Gambar nota ke canvas monospace — kolom sama persis dengan mode teks.
 * forShare: margin untuk Thermer (PNG 384, jangan 576 — Thermer potong kanan).
 */
function drawThermalCanvas(
  rows: ThermalLine[],
  opts: { width: number; cols: number; forShare?: boolean },
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;

  const { width, cols } = opts;
  const marginLeft = opts.forShare ? 8 : 4;
  const marginRight = opts.forShare ? 16 : 4;
  const usable = Math.max(width - marginLeft - marginRight, 64);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Ukuran font dihitung dari lebar nyata `cols` karakter monospace, supaya
  // baris kiri-kanan (yang sudah dipad spasi) pas selebar kertas.
  const probePx = 20;
  ctx.font = `${probePx}px monospace`;
  const probeWidth = ctx.measureText("M".repeat(cols)).width || cols * 12;
  const bodyPx = Math.max(10, Math.floor((probePx * usable) / probeWidth));
  const lineHeight = Math.round(bodyPx * 1.35);
  const padY = Math.round(bodyPx * 0.5);
  const rowHeight = (row: ThermalLine) =>
    row.emphasis === "title" || row.emphasis === "total"
      ? lineHeight * 2
      : lineHeight;
  const height = Math.max(
    rows.reduce((sum, row) => sum + rowHeight(row), 0) + padY * 2,
    40,
  );

  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  let y = padY;
  for (const row of rows) {
    const h = rowHeight(row);
    const weight = row.emphasis && row.emphasis !== "normal" ? "bold " : "";
    const x = row.align === "center" ? marginLeft + usable / 2 : marginLeft;
    ctx.textAlign = row.align === "center" ? "center" : "left";
    ctx.save();
    if (row.emphasis === "title") {
      ctx.font = `${weight}${bodyPx * 2}px monospace`;
      ctx.fillText(row.text, x, y, usable);
    } else if (row.emphasis === "total") {
      // Tinggi ganda, lebar normal — sama seperti GS ! 0x01.
      ctx.font = `${weight}${bodyPx}px monospace`;
      ctx.translate(0, y);
      ctx.scale(1, 2);
      ctx.fillText(row.text, x, 0, usable);
    } else {
      ctx.font = `${weight}${bodyPx}px monospace`;
      ctx.fillText(row.text, x, y, usable);
    }
    ctx.restore();
    y += h;
  }

  return canvas;
}

/**
 * Raster monokrom (GS v 0) — cadangan untuk printer yang mencetak kertas
 * kosong / huruf aneh pada mode teks. Dikirim per pita supaya buffer printer
 * murah tidak meluap.
 */
export function buildThermalNotaRasterEscPos(
  data: ThermalNotaInput,
  paper: ThermalPaperWidth = "58",
): Uint8Array {
  return renderLinesRaster(
    buildThermalNotaLines(data, THERMAL_COLS_BY_WIDTH[paper]),
    paper,
  );
}

function renderLinesRaster(
  rows: ThermalLine[],
  paper: ThermalPaperWidth,
): Uint8Array {
  const width = THERMAL_DOTS_BY_WIDTH[paper];
  const canvas = drawThermalCanvas(rows, {
    width,
    cols: THERMAL_COLS_BY_WIDTH[paper],
  });
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) throw new Error("Gagal menggambar nota");

  const height = canvas.height;
  const image = ctx.getImageData(0, 0, width, height);
  const bytesPerRow = width / 8;
  const chunks: Uint8Array[] = [new Uint8Array([ESC, 0x40])];

  for (let top = 0; top < height; top += RASTER_BAND_ROWS) {
    const bandRows = Math.min(RASTER_BAND_ROWS, height - top);
    const band = new Uint8Array(bytesPerRow * bandRows);
    for (let row = 0; row < bandRows; row++) {
      for (let col = 0; col < width; col++) {
        const i = ((top + row) * width + col) * 4;
        const lum =
          image.data[i]! * 0.299 +
          image.data[i + 1]! * 0.587 +
          image.data[i + 2]! * 0.114;
        if (lum < 128) band[row * bytesPerRow + (col >> 3)] |= 0x80 >> (col & 7);
      }
    }
    chunks.push(
      new Uint8Array([
        GS, 0x76, 0x30, 0x00,
        bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
        bandRows & 0xff, (bandRows >> 8) & 0xff,
      ]),
      band,
    );
  }

  chunks.push(
    new Uint8Array([ESC, 0x64, 0x04]),
    new Uint8Array([GS, 0x56, 0x01]),
  );
  return concatBytes(chunks);
}

/** PNG 384px (lebar POS-58) — jangan 576 agar Thermer tidak potong kanan. */
export async function renderThermalNotaPngBlob(
  data: ThermalNotaInput,
): Promise<Blob> {
  const canvas = drawThermalCanvas(buildThermalNotaLines(data, THERMAL_COLS), {
    width: THERMAL_SHARE_PNG_WIDTH,
    cols: THERMAL_COLS,
    forShare: true,
  });
  if (!canvas) throw new Error("Gagal membuat gambar nota");
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Gagal encode PNG"));
      },
      "image/png",
      1,
    );
  });
}

export function downloadBlobFile(
  blob: Blob,
  filename: string,
): Promise<SaveFileResult> {
  return saveBlob(blob, filename);
}

/**
 * Android: bagikan PNG ke app printer gratis (Thermal Printer BT, PrinterMax, dll).
 * Fallback: unduh PNG.
 */
export async function shareOrDownloadThermalPng(
  data: ThermalNotaInput,
  filename: string,
): Promise<"shared" | "downloaded"> {
  const blob = await renderThermalNotaPngBlob(data);
  const file = new File([blob], filename, { type: "image/png" });

  const canShareFile =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (!navigator.canShare || navigator.canShare({ files: [file] }));

  if (canShareFile) {
    try {
      await navigator.share({
        files: [file],
        title: "Nota Pembayaran",
        text: "Cetak nota ke printer thermal",
      });
      return "shared";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/AbortError|canceled|cancelled/i.test(msg)) {
        throw new Error("SHARE_CANCELLED");
      }
      // lanjut unduh
    }
  }

  await downloadBlobFile(blob, filename);
  return "downloaded";
}

export function downloadEscPosFile(
  payload: Uint8Array,
  filename: string,
): void {
  const copy = new Uint8Array(payload.byteLength);
  copy.set(payload);
  const blob = new Blob([copy], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

/** RawBT hanya di Android. */
export function isAndroidClient(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Cetak ESC/POS lewat app RawBT (Android Chrome).
 * Intent scheme: jika RawBT belum ada, Chrome buka Play Store.
 * @see https://rawbt.ru/start.html
 */
export function printViaRawBt(payload: Uint8Array): void {
  const b64 = bytesToBase64(payload);
  // Intent → Play Store jika RawBT belum terpasang. Data = base64 ESC/POS.
  const intentUrl =
    `intent:base64,${b64}` +
    "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end";
  try {
    window.location.href = intentUrl;
  } catch {
    window.location.href = `rawbt:base64,${b64}`;
  }
}

type SerialPortLike = {
  open: (options: {
    baudRate: number;
    bufferSize?: number;
  }) => Promise<void>;
  close: () => Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  readable: ReadableStream<Uint8Array> | null;
};

type SerialNav = {
  getPorts: () => Promise<SerialPortLike[]>;
  requestPort: (options?: {
    filters?: Array<{ usbVendorId?: number; usbProductId?: number }>;
  }) => Promise<SerialPortLike>;
};

/** Selalu minta pilih port — port tersimpan sering salah (kertas kosong). */
async function resolveSerialPort(): Promise<SerialPortLike> {
  const serial = (navigator as Navigator & { serial: SerialNav }).serial;
  return serial.requestPort();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function writePayload(
  port: SerialPortLike,
  payload: Uint8Array,
): Promise<void> {
  if (!port.writable) {
    throw new Error("Port serial tidak bisa ditulis");
  }
  const writer = port.writable.getWriter();
  try {
    const chunkSize = 512;
    for (let i = 0; i < payload.byteLength; i += chunkSize) {
      await writer.write(payload.subarray(i, i + chunkSize));
    }
  } finally {
    writer.releaseLock();
  }
}

/**
 * Kirim ESC/POS via Web Serial.
 * Coba beberapa baud; flush + jeda sebelum close (penting untuk BT COM).
 */
export async function printViaWebSerial(
  payload: Uint8Array,
  baudRate: number = THERMAL_BAUD_RATE,
): Promise<void> {
  if (!isWebSerialSupported()) {
    throw new Error("Web Serial tidak didukung di browser ini");
  }

  const port = await resolveSerialPort();
  const rates =
    baudRate === THERMAL_BAUD_RATE
      ? [...THERMAL_BAUD_FALLBACKS]
      : [baudRate, ...THERMAL_BAUD_FALLBACKS.filter((b) => b !== baudRate)];

  let lastError: unknown;
  for (const rate of rates) {
    try {
      await port.open({ baudRate: rate, bufferSize: 16_384 });
      try {
        await writePayload(port, payload);
        await sleep(400);
      } finally {
        try {
          await port.close();
        } catch {
          // ignore
        }
      }
      return;
    } catch (err) {
      lastError = err;
      try {
        await port.close();
      } catch {
        // ignore
      }
      await sleep(150);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Gagal kirim ke printer serial");
}
