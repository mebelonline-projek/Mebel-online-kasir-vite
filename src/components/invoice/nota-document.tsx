import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceLineItem } from "@/components/invoice/invoice-document";
import { StoreLogo } from "@/components/shared/store-logo";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { buildNotaPdfData } from "@/lib/pdf-invoice";

interface PaymentItem {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  note: string | null;
}

interface NotaProps {
  transaction_id: string;
  transaction_number: string;
  customer_name: string;
  lineItems: InvoiceLineItem[];
  final_price: number;
  payment_type: string;
  dp_amount: number;
  status: string;
  created_at: string;
  payments: PaymentItem[];
  store_name?: string;
  store_address?: string;
  store_phone?: string;
  logo_url?: string;
}

export function NotaDocument({
  transaction_id,
  transaction_number,
  customer_name,
  lineItems,
  final_price,
  payment_type,
  dp_amount,
  status,
  created_at,
  payments,
  store_name = "Mebel Online Monitoring",
  store_address = "",
  store_phone = "",
  logo_url,
}: NotaProps) {
  const navigate = useNavigate();
  const [savingPdf, setSavingPdf] = useState(false);

  const handleSavePdf = async () => {
    setSavingPdf(true);
    try {
      const pdfData = await buildNotaPdfData(transaction_id);
      if (!pdfData) throw new Error("Gagal menyiapkan data PDF");
      const [{ pdf }, { InvoiceDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/invoice/invoice-document"),
      ]);
      const blob = await pdf(<InvoiceDocument data={pdfData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NOTA-${transaction_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Nota berhasil disimpan sebagai PDF");
    } catch {
      toast.error("Gagal menyimpan nota sebagai PDF");
    } finally {
      setSavingPdf(false);
    }
  };

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = final_price - totalPaid;
  const itemsSubtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);

  return (
    <div className="bg-background text-foreground">
      <div className="mb-6 flex flex-wrap justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali
        </Button>
        <Button size="sm" onClick={() => window.print()} className="gap-1">
          <Printer className="h-3.5 w-3.5" />
          Cetak Nota
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleSavePdf()}
          disabled={savingPdf}
          className="gap-1"
        >
          <Download className="h-3.5 w-3.5" />
          {savingPdf ? "Menyimpan..." : "Simpan PDF"}
        </Button>
      </div>

      <div
        className="mx-auto max-w-[500px] rounded-xl border border-border bg-white p-6 text-black shadow-sm sm:p-8"
        id="nota-print-area"
      >
        <div className="mb-5 border-b border-dashed border-gray-300 pb-4 text-center">
          <div className="mb-2 flex items-center justify-center">
            <StoreLogo
              src={logo_url}
              alt={store_name}
              size="sm"
              variant="print"
            />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{store_name}</h2>
          {store_address && (
            <p className="mt-0.5 text-xs text-gray-500">{store_address}</p>
          )}
          {store_phone && (
            <p className="text-xs text-gray-500">Telp: {store_phone}</p>
          )}
        </div>

        <div className="mb-4 text-center">
          <h1 className="text-2xl font-black tracking-widest uppercase">
            Nota Pembayaran
          </h1>
          <p className="mt-1 font-mono text-xs text-gray-500">
            {transaction_number}
          </p>
        </div>

        <table className="mb-4 w-full text-sm">
          <tbody>
            <tr>
              <td className="w-24 py-1 text-gray-500">Tanggal</td>
              <td className="py-1">: {formatDate(created_at)}</td>
            </tr>
            <tr>
              <td className="py-1 text-gray-500">Pelanggan</td>
              <td className="py-1 font-semibold">: {customer_name}</td>
            </tr>
            <tr>
              <td className="py-1 text-gray-500">Tipe</td>
              <td className="py-1">
                : {payment_type === "CASH" ? "Cash (Lunas)" : "DP / Uang Muka"}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="my-4 border-t border-dashed border-gray-300" />

        <div className="mb-4">
          <h3 className="mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">
            Rincian Produk
          </h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-gray-800 text-left">
                <th className="py-1.5 pr-2 font-semibold">Produk</th>
                <th className="w-10 px-1 py-1.5 text-center font-semibold">
                  Qty
                </th>
                <th className="w-20 px-1 py-1.5 text-right font-semibold">
                  Harga
                </th>
                <th className="w-24 py-1.5 pl-1 text-right font-semibold">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => (
                <tr
                  key={`${item.product_name}-${index}`}
                  className="border-b border-gray-100 align-top"
                >
                  <td className="py-2 pr-2">
                    <span className="font-medium text-gray-900">
                      {item.product_name}
                    </span>
                    {item.note && (
                      <span className="mt-0.5 block text-[10px] text-gray-400">
                        {item.note}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2 text-center font-medium">
                    {item.quantity}
                  </td>
                  <td className="whitespace-nowrap px-1 py-2 text-right text-gray-600">
                    {formatCurrency(item.unit_price)}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-1 text-right font-semibold">
                    {formatCurrency(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-300">
                <td
                  colSpan={3}
                  className="py-2 text-right font-semibold text-gray-600"
                >
                  Total ({lineItems.length} item)
                </td>
                <td className="py-2 text-right text-base font-bold">
                  {formatCurrency(itemsSubtotal || final_price)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="my-4 border-t border-dashed border-gray-300" />

        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-2 text-gray-600">Total Tagihan</td>
              <td className="py-2 text-right font-bold">
                {formatCurrency(final_price)}
              </td>
            </tr>
            {payment_type === "DP" && (
              <tr className="border-b border-gray-200">
                <td className="py-2 text-gray-600">DP Awal</td>
                <td className="py-2 text-right">
                  {formatCurrency(dp_amount)}
                </td>
              </tr>
            )}
            <tr className="border-b border-gray-200">
              <td className="py-2 text-gray-600">Total Dibayar</td>
              <td className="py-2 text-right font-bold text-green-700">
                {formatCurrency(totalPaid)}
              </td>
            </tr>
            {remaining > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-2 text-gray-600">Sisa Tagihan</td>
                <td className="py-2 text-right font-bold text-red-600">
                  {formatCurrency(remaining)}
                </td>
              </tr>
            )}
            {remaining <= 0 && payment_type !== "CASH" && (
              <tr>
                <td className="py-2 font-bold text-green-700" colSpan={2}>
                  ✓ LUNAS
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {payments.length > 0 && (
          <>
            <div className="my-4 border-t border-dashed border-gray-300" />
            <h4 className="mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">
              Riwayat Pembayaran
            </h4>
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex justify-between border-b border-gray-100 py-1 text-xs"
              >
                <span>
                  {formatDate(p.payment_date)} — {p.method}
                </span>
                <span className="font-bold">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </>
        )}

        <div className="mt-6 border-t border-dashed border-gray-300 pt-4 text-center text-xs text-gray-400">
          <p>Terima kasih atas kepercayaan Anda!</p>
          <p className="mt-1 text-[10px]">{status}</p>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #nota-print-area,
          #nota-print-area * {
            visibility: visible;
          }
          #nota-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100%;
            border: none;
            box-shadow: none;
            padding: 20px;
          }
        }
      `}</style>
    </div>
  );
}
