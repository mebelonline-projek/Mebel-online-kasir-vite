/**
 * Thermal ESC/POS nota + Web Serial (Chrome desktop).
 *
 * Banyak POS-58 murah mencetak kertas kosong untuk teks ESC/POS / dialog Windows.
 * Default: raster monochrome (GS v 0) — hampir selalu keluar teks.
 */

import type { InvoiceLineItem } from "@/components/invoice/invoice-document";
import { formatCurrency, formatDate } from "@/lib/formatters";

/** Lebar karakter Font A pada roll 58mm. */
export const THERMAL_COLS = 32;

/** Dot horizontal 58mm @ ~203dpi. Harus kelipatan 8. */
export const THERMAL_DOT_WIDTH = 384;

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

function encodeAscii(text: string): Uint8Array {
  const normalized = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "?");
  const out = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    out[i] = normalized.charCodeAt(i) & 0xff;
  }
  return out;
}

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

function line(text: string): Uint8Array {
  return encodeAscii(`${text}\n`);
}

function dashLine(cols = THERMAL_COLS): string {
  return "-".repeat(cols);
}

function pairLine(left: string, right: string, cols = THERMAL_COLS): string {
  const r = right.slice(0, cols);
  const maxLeft = Math.max(0, cols - r.length - 1);
  const l = left.slice(0, maxLeft);
  const gap = Math.max(1, cols - l.length - r.length);
  return `${l}${" ".repeat(gap)}${r}`;
}

function money(n: number): string {
  return formatCurrency(n).replace(/\u00a0/g, " ");
}

function wrapText(text: string, cols: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= cols) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word.slice(0, cols);
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function asciiSafe(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

export type ThermalLineAlign = "center" | "left";

export interface ThermalLine {
  text: string;
  align: ThermalLineAlign;
  /** Header toko / judul — sedikit lebih tegas di raster */
  emphasis?: "title" | "strong" | "normal";
}

/** Baris nota tanpa pad spasi (center pakai ESC a / canvas textAlign). */
export function buildThermalNotaLines(data: ThermalNotaInput): ThermalLine[] {
  const lines: ThermalLine[] = [];
  const add = (
    text: string,
    align: ThermalLineAlign = "left",
    emphasis: ThermalLine["emphasis"] = "normal",
  ) => {
    lines.push({
      text: asciiSafe(text).slice(0, THERMAL_COLS),
      align,
      emphasis,
    });
  };

  add(data.store_name, "center", "title");
  if (data.store_address) {
    for (const part of wrapText(data.store_address, THERMAL_COLS)) {
      add(part, "center", "normal");
    }
  }
  if (data.store_phone) add(`Telp: ${data.store_phone}`, "center", "normal");
  add(dashLine(), "left");
  add("NOTA PEMBAYARAN", "center", "strong");
  add(data.transaction_number, "center", "normal");
  add(dashLine(), "left");
  add(`Tgl : ${formatDate(data.created_at)}`, "left");
  add(`Pel : ${data.customer_name}`, "left");
  add(
    `Tipe: ${data.payment_type === "CASH" ? "Cash Lunas" : "DP / UM"}`,
    "left",
  );
  if (data.description?.trim()) {
    add(dashLine(), "left");
    add("Catatan:", "left", "strong");
    for (const part of wrapText(data.description.trim(), THERMAL_COLS)) {
      add(part, "left");
    }
  }
  add(dashLine(), "left");

  const totalPaid = data.payments.reduce((s, p) => s + p.amount, 0);
  const charges = data.customerCharges || [];
  const totalDue =
    data.total_due ??
    data.final_price + charges.reduce((s, c) => s + c.amount, 0);
  const remaining = totalDue - totalPaid;

  for (const item of data.lineItems) {
    add(item.product_name, "left");
    if (item.note) add(`  ${item.note}`, "left");
    add(
      pairLine(
        `  ${item.quantity} x ${money(item.unit_price)}`,
        money(item.line_total),
      ),
      "left",
    );
  }

  if (charges.length > 0) {
    add(dashLine(), "left");
    for (const c of charges) {
      add(pairLine(c.name.slice(0, 18), money(c.amount)), "left");
    }
  }

  add(dashLine(), "left");
  add(pairLine("Total tagihan", money(totalDue)), "left", "strong");
  if (data.payment_type === "DP") {
    add(pairLine("DP awal", money(data.dp_amount)), "left");
  }
  add(pairLine("Dibayar", money(totalPaid)), "left");
  if (remaining > 0) {
    add(pairLine("Sisa", money(remaining)), "left", "strong");
  } else if (data.payment_type !== "CASH") {
    add("*** LUNAS ***", "center", "strong");
  }

  if (data.payments.length > 0) {
    add(dashLine(), "left");
    add("Riwayat bayar:", "left");
    for (const p of data.payments) {
      add(
        pairLine(
          `${formatDate(p.payment_date)} ${p.method}`.slice(0, 18),
          money(p.amount),
        ),
        "left",
      );
    }
  }

  add(dashLine(), "left");
  add("Terima kasih!", "center", "normal");
  add(data.status, "center", "normal");
  return lines;
}

/** Mode teks ESC/POS — center via ESC a, bukan spasi. */
export function buildThermalNotaEscPos(data: ThermalNotaInput): Uint8Array {
  const chunks: Uint8Array[] = [];
  const push = (b: Uint8Array) => chunks.push(b);

  push(new Uint8Array([ESC, 0x40])); // init
  push(new Uint8Array([ESC, 0x74, 0x00])); // PC437
  push(new Uint8Array([ESC, 0x33, 20])); // line spacing

  let align: ThermalLineAlign = "left";
  const setAlign = (next: ThermalLineAlign) => {
    if (next === align) return;
    align = next;
    push(new Uint8Array([ESC, 0x61, next === "center" ? 0x01 : 0x00]));
  };

  for (const row of buildThermalNotaLines(data)) {
    setAlign(row.align);
    if (row.emphasis === "title" || row.emphasis === "strong") {
      push(new Uint8Array([ESC, 0x45, 0x01]));
      push(line(row.text));
      push(new Uint8Array([ESC, 0x45, 0x00]));
    } else {
      push(line(row.text));
    }
  }

  setAlign("left");
  push(new Uint8Array([ESC, 0x64, 0x04]));
  push(new Uint8Array([GS, 0x56, 0x01]));
  return concatBytes(chunks);
}

/**
 * Gambar nota ke canvas.
 * forShare: font memenuhi lebar 384 (POS-58). Jangan 576 — Thermer potong kanan.
 */
function drawThermalNotaCanvas(
  data: ThermalNotaInput,
  opts?: { width?: number; forShare?: boolean },
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;

  const rows = buildThermalNotaLines(data);
  const forShare = opts?.forShare === true;
  const width =
    opts?.width ?? (forShare ? THERMAL_SHARE_PNG_WIDTH : THERMAL_DOT_WIDTH);
  const marginLeft = forShare ? 8 : 12;
  const marginRight = forShare ? 16 : 12;
  const usable = Math.max(width - marginLeft - marginRight, 64);
  const bodyPx = Math.max(13, Math.floor(usable / (THERMAL_COLS * 0.6)));
  const strongPx = bodyPx + 2;
  const titlePx = bodyPx + 3;
  const lineHeight = Math.round(bodyPx * 1.48);
  const padY = Math.round(bodyPx * 0.4);
  const height = Math.max(lineHeight * rows.length + padY * 2, 40);
  const centerX = Math.floor(width / 2);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  let y = padY;
  for (const row of rows) {
    if (row.emphasis === "title") {
      ctx.font = `bold ${titlePx}px monospace`;
    } else if (row.emphasis === "strong") {
      ctx.font = `bold ${strongPx}px monospace`;
    } else {
      ctx.font = `${bodyPx}px monospace`;
    }

    if (row.align === "center") {
      ctx.textAlign = "center";
      ctx.fillText(row.text, centerX, y, usable);
    } else {
      const sep = row.text.match(/^(.*?)(\s{2,})(\S.*)$/);
      if (sep) {
        const left = sep[1] ?? "";
        const right = sep[3] ?? "";
        const rightW = ctx.measureText(right).width;
        const gap = Math.max(6, Math.floor(bodyPx * 0.35));
        const leftMax = Math.max(32, usable - rightW - gap);
        ctx.textAlign = "left";
        ctx.fillText(left, marginLeft, y, leftMax);
        ctx.textAlign = "right";
        ctx.fillText(right, width - marginRight, y);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(row.text, marginLeft, y, usable);
      }
    }
    y += lineHeight;
  }

  return canvas;
}

export function buildThermalNotaRasterEscPos(
  data: ThermalNotaInput,
): Uint8Array {
  const canvas = drawThermalNotaCanvas(data, { width: THERMAL_DOT_WIDTH });
  if (!canvas) return buildThermalNotaEscPos(data);

  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return buildThermalNotaEscPos(data);

  const image = ctx.getImageData(0, 0, width, height);
  const bytesPerRow = width / 8;
  const raster = new Uint8Array(bytesPerRow * height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      const lum =
        image.data[i]! * 0.299 +
        image.data[i + 1]! * 0.587 +
        image.data[i + 2]! * 0.114;
      if (lum < 128) {
        const byteIndex = row * bytesPerRow + (col >> 3);
        raster[byteIndex] |= 0x80 >> (col & 7);
      }
    }
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  return concatBytes([
    new Uint8Array([ESC, 0x40]),
    new Uint8Array([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
    raster,
    new Uint8Array([ESC, 0x64, 0x04]),
  ]);
}

/** PNG 384px (lebar POS-58) — jangan 576 agar Thermer tidak potong kanan. */
export async function renderThermalNotaPngBlob(
  data: ThermalNotaInput,
): Promise<Blob> {
  const canvas = drawThermalNotaCanvas(data, {
    width: THERMAL_SHARE_PNG_WIDTH,
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

export function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  downloadBlobFile(blob, filename);
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
