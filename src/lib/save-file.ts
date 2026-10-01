/**
 * Simpan file (PDF, CSV, gambar) keluar dari aplikasi:
 * - Browser: unduh biasa (`<a download>`).
 * - APK Android: `<a download>` tidak jalan di WebView Capacitor — file
 *   ditulis ke cache app lalu dibuka menu Bagikan Android (simpan ke Files,
 *   kirim WhatsApp, Google Drive, dll).
 */

import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export type SaveFileResult = "saved" | "shared" | "cancelled";

/** Folder di cache Android, dikosongkan saat menyimpan file berikutnya. */
const CACHE_DIR = "unduhan";

export function saveBlob(
  blob: Blob,
  filename: string,
  title = filename,
): Promise<SaveFileResult> {
  return Capacitor.isNativePlatform()
    ? shareFromApp(blob, filename, title)
    : Promise.resolve(downloadInBrowser(blob, filename));
}

function downloadInBrowser(blob: Blob, filename: string): SaveFileResult {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Beri waktu browser memulai unduhan sebelum URL dilepas.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca file"));
    reader.readAsDataURL(blob);
  });
}

async function shareFromApp(
  blob: Blob,
  filename: string,
  title: string,
): Promise<SaveFileResult> {
  // File lama tidak dihapus tepat setelah dibagikan (aplikasi tujuan mungkin
  // masih membacanya) — dibersihkan saat menyimpan file berikutnya.
  try {
    const { files } = await Filesystem.readdir({
      path: CACHE_DIR,
      directory: Directory.Cache,
    });
    await Promise.all(
      files
        .filter((f) => f.type === "file")
        .map((f) =>
          Filesystem.deleteFile({
            path: `${CACHE_DIR}/${f.name}`,
            directory: Directory.Cache,
          }),
        ),
    );
  } catch {
    // Folder belum ada / pembersihan best-effort.
  }

  const safeName = filename.replace(/[\\/:*?"<>|]/g, "-");
  const { uri } = await Filesystem.writeFile({
    path: `${CACHE_DIR}/${safeName}`,
    data: await toBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({ title, dialogTitle: title, files: [uri] });
    return "shared";
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return "cancelled";
    throw err;
  }
}
