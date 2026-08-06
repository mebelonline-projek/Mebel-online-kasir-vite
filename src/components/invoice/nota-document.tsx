import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Printer, Usb } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceLineItem } from "@/components/invoice/invoice-document";
import { StoreLogo } from "@/components/shared/store-logo";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { buildNotaPdfData } from "@/lib/pdf-invoice";
import { printNotaHtml } from "@/lib/print-nota-html";
import {
  downloadBlob,
  isMobilePrintClient,
  renderNotaPdfBlob,
} from "@/lib/print-nota-pdf";
import {
  buildThermalNotaEscPos,
  downloadEscPosFile,
  isWebSerialSupported,
  printViaWebSerial,
} from "@/lib/thermal-escpos";

interface PaymentItem {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  note: string | null;
}

interface CustomerChargeItem {
  name: string;
  amount: number;
}

interface NotaProps {
  transaction_id: string;
  transaction_number: string;
  customer_name: string;
  lineItems: InvoiceLineItem[];
  customerCharges?: CustomerChargeItem[];
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
  customerCharges = [],
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
  const [printingThermal, setPrintingThermal] = useState(false);
  const [serialOk, setSerialOk] = useState(false);
  const [mobileClient, setMobileClient] = useState(false);

  useEffect(() => {
    setSerialOk(isWebSerialSupported());
    setMobileClient(isMobilePrintClient());
  }, []);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const chargesTotal = customerCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalDue = final_price + chargesTotal;
  const remaining = totalDue - totalPaid;
  const itemsSubtotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);

  const handleSavePdf = async () => {
    setSavingPdf(true);
    try {
      const pdfData = await buildNotaPdfData(transaction_id);
      if (!pdfData) throw new Error("Gagal menyiapkan data PDF");
      const blob = await renderNotaPdfBlob(pdfData);
      downloadBlob(blob, `NOTA-${transaction_number}.pdf`);
      toast.success("Nota berhasil disimpan sebagai PDF");
    } catch {
      toast.error("Gagal menyimpan nota sebagai PDF");
    } finally {
      setSavingPdf(false);
    }
  };

  const buildEscPosPayload = () =>
    buildThermalNotaEscPos({
      store_name,
      store_address: store_address || undefined,
      store_phone: store_phone || undefined,
      transaction_number,
      customer_name,
      payment_type,
      created_at,
      lineItems,
      customerCharges,
      final_price,
      total_due: totalDue,
      dp_amount,
      status,
      payments,
    });

  /** Dialog sistem (POS-58). Jika kertas kosong, pakai Cetak Thermal ESC/POS. */
  const handlePrintNota = () => {
    try {
      printNotaHtml({
        store_name,
        store_address: store_address || undefined,
        store_phone: store_phone || undefined,
        transaction_number,
        customer_name,
        payment_type,
        created_at_label: formatDate(created_at),
        lineItems,
        customerCharges,
        final_price,
        total_due: totalDue,
        total_paid: totalPaid,
        remaining,
        dp_amount,
        status,
        payments: payments.map((p) => ({
          payment_date: formatDate(p.payment_date),
          method: p.method,
          amount: p.amount,
        })),
        money: formatCurrency,
      });
      toast.message(
        serialOk
          ? "Jika kertas kosong: batalkan, lalu pakai Cetak Thermal (ESC/POS)."
          : "POS-58: kertas 58mm, skala 100%. Jika kertas kosong, driver tidak cocok — pakai USB + Cetak Thermal di Chrome PC.",
        { duration: 10000 },
      );
    } catch {
      toast.error("Gagal membuka dialog cetak. Coba hard refresh lalu ulang.");
    }
  };

  const handleThermalPrint = async () => {
    setPrintingThermal(true);
    try {
      await printViaWebSerial(buildEscPosPayload());
      toast.success("Nota dikirim ke printer thermal");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/NotFoundError|No port selected|cancelled/i.test(msg)) {
        toast.message("Pemilihan printer dibatalkan");
      } else {
        toast.error(
          "Gagal cetak thermal. Pilih port COM/USB printer di dialog Chrome.",
        );
      }
    } finally {
      setPrintingThermal(false);
    }
  };

  const handleDownloadEscPos = () => {
    try {
      downloadEscPosFile(
        buildEscPosPayload(),
        `NOTA-${transaction_number}.bin`,
      );
      toast.message(
        "File .bin diunduh. Di Android buka dengan RawBT / app printer ESC/POS.",
        { duration: 9000 },
      );
    } catch {
      toast.error("Gagal membuat file thermal");
    }
  };

  return (
    <div className="bg-background text-foreground">
      <div
        className="mb-6 flex flex-wrap justify-end gap-3"
        id="nota-toolbar"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali
        </Button>
        {serialOk && (
          <Button
            size="sm"
            onClick={() => void handleThermalPrint()}
            disabled={printingThermal}
            className="gap-1"
            title="Kirim ESC/POS langsung — cocok jika Cetak Nota menghasilkan kertas kosong"
          >
            <Usb className="h-3.5 w-3.5" />
            {printingThermal ? "Mencetak..." : "Cetak Thermal"}
          </Button>
        )}
        <Button
          size="sm"
          variant={serialOk ? "outline" : "default"}
          onClick={() => handlePrintNota()}
          className="gap-1"
          title="Dialog cetak Windows/Chrome ke POS-58"
        >
          <Printer className="h-3.5 w-3.5" />
          Cetak Nota
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleDownloadEscPos()}
          className="gap-1"
          title="Unduh perintah ESC/POS untuk RawBT / app printer"
        >
          <Download className="h-3.5 w-3.5" />
          File Thermal
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
      <p className="mb-4 text-center text-xs text-muted-foreground">
        {serialOk ? (
          <>
            Kertas keluar tapi kosong? Pakai{" "}
            <span className="font-medium">Cetak Thermal</span> (USB/COM). Dialog
            Windows sering tidak menggambar teks di POS-58.
          </>
        ) : mobileClient ? (
          <>
            Di HP: unduh <span className="font-medium">File Thermal</span> lalu
            buka dengan RawBT. Atau Cetak Nota → Bluetooth (hasil tergantung
            driver).
          </>
        ) : (
          <>
            Sambungkan printer USB di Chrome PC agar tombol{" "}
            <span className="font-medium">Cetak Thermal</span> muncul — paling
            andal untuk POS-58.
          </>
        )}
      </p>

      <div
        className="mx-auto max-w-[500px] rounded-xl border border-border bg-white p-6 text-black shadow-sm sm:p-8"
        id="nota-print-area"
      >
        <div className="mb-5 border-b border-dashed border-gray-300 pb-4 text-center">
          <div
            className="mb-2 flex items-center justify-center"
            id="nota-print-logo"
          >
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
                  Subtotal barang ({lineItems.length} item)
                </td>
                <td className="py-2 text-right text-base font-bold">
                  {formatCurrency(itemsSubtotal || final_price)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {customerCharges.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-bold tracking-wider text-gray-500 uppercase">
              Biaya dibebankan ke pembeli
            </h3>
            <table className="w-full border-collapse text-xs">
              <tbody>
                {customerCharges.map((c, index) => (
                  <tr
                    key={`${c.name}-${index}`}
                    className="border-b border-gray-100"
                  >
                    <td className="py-2 pr-2 font-medium text-gray-900">
                      {c.name}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-1 text-right font-semibold">
                      {formatCurrency(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="my-4 border-t border-dashed border-gray-300" />

        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-2 text-gray-600">Total Tagihan</td>
              <td className="py-2 text-right font-bold">
                {formatCurrency(totalDue)}
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
          @page {
            size: 58mm auto;
            margin: 2mm;
          }
          html, body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 58mm;
          }
          body * {
            visibility: hidden;
          }
          #nota-toolbar {
            display: none !important;
          }
          #nota-print-area,
          #nota-print-area * {
            visibility: visible;
          }
          #nota-print-logo {
            display: none !important;
          }
          #nota-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 54mm;
            max-width: 54mm;
            margin: 0;
            padding: 1mm 2mm;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
            font-family: ui-monospace, "Courier New", monospace !important;
            font-size: 9pt !important;
            line-height: 1.25 !important;
          }
          #nota-print-area h1 {
            font-size: 11pt !important;
            letter-spacing: 0.05em !important;
            margin: 0.2em 0 !important;
          }
          #nota-print-area h2 {
            font-size: 10pt !important;
            margin: 0 !important;
          }
          #nota-print-area h3,
          #nota-print-area h4 {
            font-size: 8pt !important;
          }
          #nota-print-area table,
          #nota-print-area td,
          #nota-print-area th,
          #nota-print-area p,
          #nota-print-area span {
            font-size: 8pt !important;
          }
          #nota-print-area .text-base {
            font-size: 9pt !important;
          }
          #nota-print-area .text-green-700,
          #nota-print-area .text-red-600,
          #nota-print-area .text-gray-400,
          #nota-print-area .text-gray-500,
          #nota-print-area .text-gray-600,
          #nota-print-area .text-gray-900 {
            color: #000 !important;
          }
        }
      `}</style>
    </div>
  );
}
