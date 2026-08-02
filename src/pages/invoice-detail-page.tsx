import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Download, Printer, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { StoreLogo } from "@/components/shared/store-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/auth-context";
import {
  deleteInvoice,
  getInvoiceById,
  getStoreSettings,
  type InvoiceDetail,
  type StoreSettingsRow,
} from "@/lib/invoices";
import { buildFakturPdfData } from "@/lib/pdf-invoice";
import { formatCurrency, formatDate } from "@/lib/formatters";

function statusBadgeClass(status: string) {
  if (status === "PAID") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  }
  if (status === "DRAFT") return "bg-muted text-muted-foreground";
  if (status === "SENT") return "bg-primary/10 text-primary";
  return "bg-destructive/10 text-destructive";
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isOwner = role === "OWNER";

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettingsRow | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    void (async () => {
      setLoading(true);
      const [invResult, settings] = await Promise.all([
        getInvoiceById(id),
        getStoreSettings(),
      ]);
      if (!mounted) return;
      if (!invResult.success || !invResult.data) {
        toast.error(invResult.message || "Invoice tidak ditemukan");
        setInvoice(null);
      } else {
        setInvoice(invResult.data);
      }
      setStoreSettings(settings);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  const handleDelete = async () => {
    if (!invoice) return;
    setIsDeleting(true);
    const result = await deleteInvoice(invoice.id);
    if (!result.success) {
      toast.error(result.message || "Gagal menghapus invoice");
      setIsDeleting(false);
      return;
    }
    toast.success(result.message);
    navigate("/invoice");
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    setIsDownloading(true);
    try {
      const pdfData = await buildFakturPdfData(invoice.id);
      if (!pdfData) throw new Error("Gagal menyiapkan data PDF");
      const [{ pdf }, { InvoiceDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/invoice/invoice-document"),
      ]);
      const blob = await pdf(<InvoiceDocument data={pdfData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `INV-${pdfData.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal mengunduh PDF"
      );
    } finally {
      setIsDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-96 rounded-xl bg-muted/50" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Invoice tidak ditemukan.</p>
        <Button variant="outline" onClick={() => navigate("/invoice")}>
          Kembali ke daftar
        </Button>
      </div>
    );
  }

  const allTransactions =
    invoice.invoice_items
      ?.map((item) => item.transactions)
      .filter((tx): tx is NonNullable<typeof tx> => Boolean(tx)) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold md:text-3xl">
              {invoice.invoice_number}
            </h1>
            <Badge className={statusBadgeClass(invoice.status)}>
              {invoice.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Preview Invoice</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/invoice")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Kembali</span>
          </Button>
          {isOwner && (
            <Button
              variant="outline"
              size="icon"
              className="border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowDelete(true)}
              aria-label="Hapus invoice"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            onClick={() => void handleDownloadPDF()}
            disabled={isDownloading}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">
              {isDownloading ? "Menyiapkan..." : "Unduh PDF"}
            </span>
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="gap-2"
          >
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Cetak</span>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div
          className="bg-white p-4 text-black md:p-8 lg:p-12 dark:bg-white dark:text-black"
          id="invoice-print-area"
        >
          <div className="mb-8 flex flex-row items-start justify-between border-b-2 border-[#800000] pb-6">
            <div className="flex items-center gap-4">
              <StoreLogo
                src={storeSettings?.logo_url}
                alt={storeSettings?.store_name || "Logo toko"}
                size="lg"
                variant="print"
              />
              <div>
                <h2 className="text-xl font-bold text-[#800000]">
                  {storeSettings?.store_name || "Mebel Online Monitoring"}
                </h2>
                {storeSettings?.address && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {storeSettings.address}
                  </p>
                )}
                {storeSettings?.phone && (
                  <p className="text-xs text-gray-500">
                    Telp: {storeSettings.phone}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <h3 className="text-2xl font-bold text-[#800000]">INVOICE</h3>
              <p className="mt-1 text-sm font-bold text-gray-800">
                {invoice.invoice_number}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatDate(invoice.created_at)}
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="mb-2 border-b border-gray-200 pb-1 text-sm font-bold text-[#800000]">
              Data Pelanggan
            </h4>
            <div className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
              <div className="flex">
                <span className="w-20 text-gray-500">Nama</span>
                <span className="font-medium">
                  {invoice.customer_name || "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="mb-2 border-b border-gray-200 pb-1 text-sm font-bold text-[#800000]">
              Detail Pesanan
            </h4>
            <div className="mb-4 space-y-2 md:hidden">
              {allTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm"
                >
                  <p className="font-mono font-bold">{tx.transaction_number}</p>
                  <div className="mt-1 flex justify-between">
                    <span>{tx.payment_type === "CASH" ? "Cash" : "DP"}</span>
                    <span className="font-semibold">
                      {formatCurrency(tx.final_price)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#800000] hover:bg-[#800000] [&>th]:border-white/20 [&>th]:text-white">
                    <TableHead className="text-left font-medium">
                      No. Transaksi
                    </TableHead>
                    <TableHead className="text-center font-medium">
                      Tipe
                    </TableHead>
                    <TableHead className="text-right font-medium">
                      Harga
                    </TableHead>
                    <TableHead className="text-right font-medium">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allTransactions.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <TableCell className="font-mono text-xs">
                        {tx.transaction_number}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {tx.payment_type === "CASH" ? "Cash" : "DP"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(tx.final_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge status={tx.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mb-6 ml-auto w-full md:w-1/2">
            <div className="flex justify-between py-1 text-sm">
              <span className="text-gray-500">Total Pesanan</span>
              <span className="font-medium">
                {formatCurrency(invoice.total_amount)}
              </span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-gray-500">Total Dibayar</span>
              <span className="font-medium text-green-600">
                {formatCurrency(invoice.total_paid)}
              </span>
            </div>
            <div className="mt-2 flex justify-between rounded border-t-2 border-[#800000] bg-gray-50 px-2 py-2 text-base font-bold">
              <span>Sisa Tagihan</span>
              <span
                className={
                  invoice.remaining_amount <= 0
                    ? "text-green-600"
                    : "text-red-600"
                }
              >
                {invoice.remaining_amount <= 0
                  ? "LUNAS"
                  : formatCurrency(invoice.remaining_amount)}
              </span>
            </div>
          </div>

          {invoice.notes && (
            <div className="mb-6">
              <h4 className="mb-2 border-b border-gray-200 pb-1 text-sm font-bold text-[#800000]">
                Catatan
              </h4>
              <p className="text-sm text-gray-600">{invoice.notes}</p>
            </div>
          )}

          <div className="mt-10 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
            <p>Terima kasih atas kepercayaan Anda</p>
            <p className="mt-1">
              {storeSettings?.store_name || "Mebel Online Monitoring"}
              {storeSettings?.address ? ` — ${storeSettings.address}` : ""}
            </p>
          </div>
        </div>
      </Card>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print-area, #invoice-print-area * { visibility: visible; }
          #invoice-print-area {
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

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Hapus Invoice
            </AlertDialogTitle>
            <AlertDialogDescription>
              Yakin hapus{" "}
              <strong className="text-foreground">
                {invoice.invoice_number}
              </strong>
              ? Data akan hilang permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Menghapus..." : "Ya, Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
