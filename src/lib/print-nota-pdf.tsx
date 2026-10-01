import type { InvoiceData } from "@/components/invoice/invoice-document";
import { saveBlob, type SaveFileResult } from "@/lib/save-file";

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

export function downloadBlob(
  blob: Blob,
  filename: string,
): Promise<SaveFileResult> {
  return saveBlob(blob, filename);
}
