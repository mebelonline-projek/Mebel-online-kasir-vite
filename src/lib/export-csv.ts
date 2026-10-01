import { saveBlob, type SaveFileResult } from "@/lib/save-file";

export function downloadCsv(
  filename: string,
  rows: string[][],
): Promise<SaveFileResult> {
  const escape = (value: string | number) =>
    `"${String(value).replace(/"/g, '""')}"`;

  const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  return saveBlob(blob, filename, "Export transaksi");
}
