import type { InvoiceData } from "@/components/invoice/invoice-document";

/** Deteksi Android / HP untuk petunjuk UI cetak. */
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
