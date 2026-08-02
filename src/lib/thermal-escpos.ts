/**
 * Thermal ESC/POS nota + Web Serial (Chrome desktop USB).
 *
 * Hardware yang didukung (beli / uji di toko):
 * - Protokol ESC/POS (bukan app proprietary saja)
 * - Kertas 58mm (lebar cetak efektif ~32 kolom font A)
 * - Bluetooth Classic (pair OS Android/Windows) + USB
 * - Windows: Generic / Text Only atau raw serial USB
 *
 * Cetak HP Android / PC pair OS → window.print() + layout 58mm (Jalur A).
 * Cetak 1-tap PC USB → printViaWebSerial() di bawah (Jalur B).
 * iPhone PWA: thermal kasir BT biasanya tidak tersedia (AirPrint saja).
 */

import type { InvoiceLineItem } from "@/components/invoice/invoice-document";
import { formatCurrency, formatDate } from "@/lib/formatters";

/** Lebar karakter Font A pada roll 58mm. */
export const THERMAL_COLS = 32;

/** Baud default kebanyakan printer thermal USB murah. */
export const THERMAL_BAUD_RATE = 9600;

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
  lineItems: InvoiceLineItem[];
  final_price: number;
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

function center(text: string, cols = THERMAL_COLS): string {
  const t = text.slice(0, cols);
  const pad = Math.max(0, Math.floor((cols - t.length) / 2));
  return `${" ".repeat(pad)}${t}`;
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

/** Bangun payload ESC/POS untuk nota thermal 58mm. */
export function buildThermalNotaEscPos(data: ThermalNotaInput): Uint8Array {
  const chunks: Uint8Array[] = [];
  const push = (b: Uint8Array) => chunks.push(b);

  // ESC @ — init
  push(new Uint8Array([ESC, 0x40]));
  // ESC a 1 — center
  push(new Uint8Array([ESC, 0x61, 0x01]));
  // ESC E 1 — bold on
  push(new Uint8Array([ESC, 0x45, 0x01]));
  push(line(data.store_name.slice(0, THERMAL_COLS)));
  push(new Uint8Array([ESC, 0x45, 0x00]));

  if (data.store_address) {
    for (const part of wrapText(data.store_address, THERMAL_COLS)) {
      push(line(center(part)));
    }
  }
  if (data.store_phone) {
    push(line(center(`Telp: ${data.store_phone}`)));
  }

  push(line(center("NOTA PEMBAYARAN")));
  push(line(center(data.transaction_number)));

  // ESC a 0 — left
  push(new Uint8Array([ESC, 0x61, 0x00]));
  push(line(dashLine()));
  push(line(`Tgl : ${formatDate(data.created_at)}`));
  push(line(`Pel : ${data.customer_name}`.slice(0, THERMAL_COLS)));
  push(
    line(
      `Tipe: ${data.payment_type === "CASH" ? "Cash Lunas" : "DP / UM"}`,
    ),
  );
  push(line(dashLine()));

  const totalPaid = data.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = data.final_price - totalPaid;

  for (const item of data.lineItems) {
    push(line(item.product_name.slice(0, THERMAL_COLS)));
    if (item.note) {
      push(line(`  ${item.note}`.slice(0, THERMAL_COLS)));
    }
    push(
      line(
        pairLine(
          `  ${item.quantity} x ${money(item.unit_price)}`,
          money(item.line_total),
        ),
      ),
    );
  }

  push(line(dashLine()));
  push(line(pairLine("Total tagihan", money(data.final_price))));
  if (data.payment_type === "DP") {
    push(line(pairLine("DP awal", money(data.dp_amount))));
  }
  push(line(pairLine("Dibayar", money(totalPaid))));
  if (remaining > 0) {
    push(line(pairLine("Sisa", money(remaining))));
  } else if (data.payment_type !== "CASH") {
    push(line(center("*** LUNAS ***")));
  }

  if (data.payments.length > 0) {
    push(line(dashLine()));
    push(line("Riwayat bayar:"));
    for (const p of data.payments) {
      push(
        line(
          pairLine(
            `${formatDate(p.payment_date)} ${p.method}`.slice(0, 18),
            money(p.amount),
          ),
        ),
      );
    }
  }

  push(line(dashLine()));
  push(new Uint8Array([ESC, 0x61, 0x01]));
  push(line("Terima kasih!"));
  push(line(data.status.slice(0, THERMAL_COLS)));
  push(new Uint8Array([ESC, 0x61, 0x00]));

  // Feed + partial cut (GS V 1)
  push(new Uint8Array([ESC, 0x64, 0x03]));
  push(new Uint8Array([GS, 0x56, 0x01]));

  return concatBytes(chunks);
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

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

type SerialPortLike = {
  open: (options: { baudRate: number }) => Promise<void>;
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

async function resolveSerialPort(): Promise<SerialPortLike> {
  const serial = (navigator as Navigator & { serial: SerialNav }).serial;
  const existing = await serial.getPorts();
  if (existing.length > 0) return existing[0];
  return serial.requestPort();
}

/**
 * Kirim byte ESC/POS ke printer USB via Web Serial (perlu gesture user).
 * Memakai port yang sudah diizinkan, atau prompt requestPort.
 */
export async function printViaWebSerial(
  payload: Uint8Array,
  baudRate: number = THERMAL_BAUD_RATE,
): Promise<void> {
  if (!isWebSerialSupported()) {
    throw new Error("Web Serial tidak didukung di browser ini");
  }

  const port = await resolveSerialPort();
  await port.open({ baudRate });

  try {
    if (!port.writable) {
      throw new Error("Port serial tidak bisa ditulis");
    }
    const writer = port.writable.getWriter();
    try {
      await writer.write(payload);
    } finally {
      writer.releaseLock();
    }
  } finally {
    try {
      await port.close();
    } catch {
      // ignore close errors after write
    }
  }
}
