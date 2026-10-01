/**
 * Printer thermal Bluetooth Classic (SPP) — hanya di APK Android.
 *
 * Browser (Web Bluetooth) hanya bisa BLE, sedangkan printer thermal murah
 * memakai Bluetooth Classic. APK membungkus SPA yang sama dengan Capacitor +
 * plugin native `@nosslabs/bluetooth-classic` (ditambal di
 * `patches/@nosslabs+bluetooth-classic+*.patch`: daftar printer yang sudah
 * di-pairing, connect lebih tahan gagal).
 *
 * Pilihan printer, lebar kertas & mode cetak disimpan per HP (localStorage),
 * bukan di database — tiap HP bisa tersambung ke printer berbeda.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type {
  ThermalPaperWidth,
  ThermalPrintMode,
} from "@/lib/thermal-escpos";

export interface BluetoothDevice {
  name: string | null;
  address: string;
  type: "classic" | "le" | "dual" | "unknown";
  state: "none" | "bonded" | "bonding" | "unknown";
}

interface BluetoothClassicPlugin {
  checkPermissions(): Promise<{ status: "granted" | "denied" | "prompt" }>;
  requestPermissions(): Promise<{ status: "granted" | "denied" | "prompt" }>;
  isEnabled(): Promise<{ enabled: boolean }>;
  enable(): Promise<{ enabled: boolean }>;
  /** Tambahan dari patch — daftar pairing HP, instan. */
  bondedDevices(): Promise<{ devices: BluetoothDevice[] }>;
  scan(options: { duration: number }): Promise<{ devices: BluetoothDevice[] }>;
  pair(options: { address: string }): Promise<void>;
  connect(options: { address: string }): Promise<void>;
  write(options: { data: number[] }): Promise<void>;
  disconnect(): Promise<void>;
}

// Pakai registerPlugin langsung (bukan wrapper JS paket) supaya method
// tambahan dari patch (`bondedDevices`) ikut bisa dipanggil.
const BluetoothClassic =
  registerPlugin<BluetoothClassicPlugin>("BluetoothClassic");

/** True hanya di dalam APK Android (bukan Chrome Android biasa). */
export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

// ---------------------------------------------------------------- pengaturan

export interface PrinterSettings {
  address: string | null;
  name: string | null;
  paper: ThermalPaperWidth;
  mode: ThermalPrintMode;
}

const KEY_ADDRESS = "printer-bt-address";
const KEY_NAME = "printer-bt-name";
const KEY_PAPER = "printer-paper-width";
const KEY_MODE = "printer-print-mode";

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Best-effort per HP; tanpa localStorage pilihan berlaku untuk sesi ini saja.
  }
}

export function readPrinterSettings(): PrinterSettings {
  return {
    address: readKey(KEY_ADDRESS),
    name: readKey(KEY_NAME),
    paper: readKey(KEY_PAPER) === "80" ? "80" : "58",
    mode: readKey(KEY_MODE) === "image" ? "image" : "text",
  };
}

export function savePrinterDevice(device: BluetoothDevice): void {
  const previous = readKey(KEY_ADDRESS);
  writeKey(KEY_ADDRESS, device.address);
  writeKey(KEY_NAME, device.name || null);
  if (previous !== device.address) void dropConnection();
}

export function savePrinterPaper(paper: ThermalPaperWidth): void {
  writeKey(KEY_PAPER, paper);
}

export function savePrinterMode(mode: ThermalPrintMode): void {
  writeKey(KEY_MODE, mode);
}

// -------------------------------------------------------------------- galat

/** Galat yang pesannya sudah ramah untuk kasir (ditampilkan apa adanya). */
export class PrinterError extends Error {
  readonly code: "NO_PRINTER" | "PERMISSION" | "BLUETOOTH_OFF" | "OTHER";

  constructor(message: string, code: PrinterError["code"] = "OTHER") {
    super(message);
    this.name = "PrinterError";
    this.code = code;
  }
}

/** Ubah galat plugin (bahasa Inggris, teknis) jadi langkah perbaikan. */
export function printerErrorMessage(err: unknown): string {
  if (err instanceof PrinterError) return err.message;
  const detail = err instanceof Error ? err.message : String(err);
  if (/bluetooth is not enabled/i.test(detail)) {
    return "Bluetooth HP mati — nyalakan Bluetooth, lalu coba lagi.";
  }
  if (/read failed|socket|timeout|connect|refused|host is down/i.test(detail)) {
    return "Tidak bisa tersambung ke printer. Pastikan printer menyala, dekat HP, dan tidak sedang tersambung ke HP lain, lalu coba lagi.";
  }
  if (/broken pipe|not connected/i.test(detail)) {
    return "Sambungan ke printer terputus. Coba cetak lagi.";
  }
  return `Gagal mencetak. Pastikan printer menyala & kertas terpasang, lalu coba lagi. (${detail})`;
}

// ------------------------------------------------------------ izin & status

export async function ensureBluetoothPermission(): Promise<void> {
  if ((await BluetoothClassic.checkPermissions()).status === "granted") return;
  try {
    await BluetoothClassic.requestPermissions();
  } catch {
    // Android 12+: plugin ikut meminta ACCESS_FINE_LOCATION yang di
    // manifest-nya dibatasi maxSdkVersion=30, sehingga Capacitor menolak
    // panggilan ini walau izin "Perangkat sekitar" sudah diberikan user.
    // Status sebenarnya dicek ulang di bawah.
  }
  if ((await BluetoothClassic.checkPermissions()).status !== "granted") {
    throw new PrinterError(
      "Izin Bluetooth belum diberikan. Buka Setelan HP → Aplikasi → Mebel Monitor → Izin, lalu izinkan \"Perangkat sekitar\".",
      "PERMISSION",
    );
  }
}

export async function ensureBluetoothOn(): Promise<void> {
  if ((await BluetoothClassic.isEnabled()).enabled) return;
  const result = await BluetoothClassic.enable();
  if (!result.enabled) {
    throw new PrinterError(
      "Bluetooth HP belum dinyalakan — nyalakan dulu, lalu coba lagi.",
      "BLUETOOTH_OFF",
    );
  }
}

async function prepare(): Promise<void> {
  if (!isNativeAndroid()) {
    throw new PrinterError("Printer Bluetooth hanya bisa dari aplikasi Android (APK).");
  }
  await ensureBluetoothPermission();
  await ensureBluetoothOn();
}

// ---------------------------------------------------------- cari & pairing

/** BLE-only tidak bisa SPP — tidak mungkin printer thermal Classic. */
function canBePrinter(device: BluetoothDevice): boolean {
  return device.type !== "le" && Boolean(device.address);
}

/** Nama umum printer thermal murah — hanya untuk urutan daftar, bukan filter. */
const LIKELY_PRINTER_NAME =
  /print|pos|thermal|rpp|mtp|goojprt|zjiang|xprinter|epson|panda|^pt-?\d|^bt-?\d|^p58|^p80|^xp-|^zj-|58|80/i;

function sortDevices(devices: BluetoothDevice[]): BluetoothDevice[] {
  const unique = new Map<string, BluetoothDevice>();
  for (const d of devices) if (canBePrinter(d)) unique.set(d.address, d);
  const rank = (d: BluetoothDevice) =>
    (d.state === "bonded" ? 0 : 2) +
    (LIKELY_PRINTER_NAME.test(d.name || "") ? 0 : 1);
  return [...unique.values()].sort(
    (a, b) =>
      rank(a) - rank(b) || (a.name || "~").localeCompare(b.name || "~"),
  );
}

/** Device yang sudah di-pairing di HP (instan). */
export async function listPairedDevices(): Promise<BluetoothDevice[]> {
  await prepare();
  const { devices } = await BluetoothClassic.bondedDevices();
  return sortDevices(devices);
}

/** Cari device di sekitar (± 8 detik) + yang sudah di-pairing. */
export async function scanDevices(): Promise<BluetoothDevice[]> {
  await prepare();
  const { devices } = await BluetoothClassic.scan({ duration: 8000 });
  return sortDevices(devices);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mulai pairing (Android menampilkan dialog/PIN), lalu tunggu sampai printer
 * masuk daftar pairing. True = berhasil di-pairing dalam batas waktu.
 */
export async function pairDevice(
  address: string,
  timeoutMs = 45_000,
): Promise<boolean> {
  await prepare();
  await BluetoothClassic.pair({ address });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(1000);
    const { devices } = await BluetoothClassic.bondedDevices();
    if (devices.some((d) => d.address === address)) return true;
  }
  return false;
}

// ------------------------------------------------------------------ cetak

/** Alamat yang sedang tersambung di sesi ini (null = belum / putus). */
let connectedAddress: string | null = null;

// Printer hanya bisa melayani satu kiriman pada satu waktu (mis. ketuk
// "Cetak" dua kali) — kiriman berikutnya menunggu yang sebelumnya selesai.
let queueTail: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const result = queueTail.then(job, job);
  queueTail = result.catch(() => {});
  return result;
}

async function dropConnection(): Promise<void> {
  connectedAddress = null;
  try {
    await BluetoothClassic.disconnect();
  } catch {
    // Sudah putus.
  }
}

/**
 * Dikirim per potongan kecil dengan jeda: printer murah punya buffer kecil
 * tanpa flow control — data raster besar sekaligus bisa tercetak acak.
 */
const WRITE_CHUNK = 512;
const WRITE_PAUSE_MS = 20;

async function writeAll(bytes: Uint8Array): Promise<void> {
  for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK) {
    const chunk = bytes.subarray(offset, offset + WRITE_CHUNK);
    await BluetoothClassic.write({ data: Array.from(chunk) });
    if (offset + WRITE_CHUNK < bytes.length) await sleep(WRITE_PAUSE_MS);
  }
}

async function connect(address: string): Promise<void> {
  connectedAddress = null;
  await BluetoothClassic.connect({ address });
  connectedAddress = address;
}

/** Kirim byte ESC/POS ke printer tersimpan. Sambung otomatis bila perlu. */
export function printBytes(bytes: Uint8Array): Promise<void> {
  return enqueue(async () => {
    const { address } = readPrinterSettings();
    if (!address) {
      throw new PrinterError(
        "Printer belum dipilih. Ketuk Atur Printer untuk memilih printer.",
        "NO_PRINTER",
      );
    }
    await prepare();
    if (connectedAddress === address) {
      try {
        await writeAll(bytes);
        return;
      } catch {
        // Sambungan lama putus (printer sempat mati / tidur / keluar
        // jangkauan) — sambung ulang sekali di bawah.
        await dropConnection();
      }
    }
    await connect(address);
    await writeAll(bytes);
  });
}
