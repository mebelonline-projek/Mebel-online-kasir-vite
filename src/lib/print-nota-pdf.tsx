import type { InvoiceData } from "@/components/invoice/invoice-document";

/** Deteksi Android / HP — Chrome BT print lewat HTML 58mm sering pecah. */
export function isMobilePrintClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export async function renderNotaPdfBlob(data: InvoiceData): Promise<Blob> {
  const [{ pdf }, { NotaPdfDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/invoice/nota-pdf-document"),
  ]);
  return pdf(<NotaPdfDocument data={data} />).toBlob();
}

export function downloadBlob(blob: Blob, filename: string): void {
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
 * Cetak nota thermal via PDF 58mm.
 * Android Chrome: buka PDF di tab baru → user Cetak → printer Bluetooth.
 * Desktop: iframe + print dialog.
 */
export async function printNotaPdfBlob(
  blob: Blob,
): Promise<"opened" | "iframe"> {
  const url = URL.createObjectURL(blob);

  if (isMobilePrintClient()) {
    // Jangan pakai noopener — Chrome mengembalikan null meski tab terbuka.
    const win = window.open(url, "_blank");
    if (!win) {
      downloadBlob(blob, "nota-cetak.pdf");
      URL.revokeObjectURL(url);
      throw new Error("POPUP_BLOCKED");
    }
    // Biarkan tab PDF hidup; revoke setelah delay agar Chrome sempat load.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "opened";
  }

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 1500);
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        cleanup();
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    iframe.onerror = () => {
      cleanup();
      reject(new Error("Gagal memuat PDF untuk cetak"));
    };

    document.body.appendChild(iframe);
  });

  return "iframe";
}
