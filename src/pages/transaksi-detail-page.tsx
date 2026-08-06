import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  DollarSign,
  FileText,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { FulfillmentBadge } from "@/components/shared/fulfillment-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { TransaksiDetailSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FULFILLMENT_STATUSES } from "@/config/fulfillment";
import { useAuth } from "@/contexts/auth-context";
import { emitDataChanged } from "@/lib/data-events";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { totalTagihan } from "@/lib/customer-charges";
import {
  deleteTransactionPermanent,
  getTransactionById,
  updateFulfillmentStatus,
  voidTransaction,
  type TransactionDetail,
} from "@/lib/transactions";

export function TransaksiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isVoiding, setIsVoiding] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [fulfillmentStatus, setFulfillmentStatus] = useState("MENUNGGU");
  const [isUpdatingFulfillment, setIsUpdatingFulfillment] = useState(false);

  async function reloadDetail(transactionId: string) {
    const result = await getTransactionById(transactionId);
    if (!result.success || !result.data) {
      toast.error(result.message || "Tidak ditemukan");
      navigate("/transaksi", { replace: true });
      return;
    }
    setTx(result.data);
    setFulfillmentStatus(result.data.fulfillment_status || "MENUNGGU");
  }

  useEffect(() => {
    if (!id || id.startsWith("offline:")) {
      toast.error("Transaksi offline belum tersinkron");
      navigate("/transaksi", { replace: true });
      return;
    }
    let mounted = true;
    void (async () => {
      const result = await getTransactionById(id);
      if (!mounted) return;
      if (!result.success || !result.data) {
        toast.error(result.message || "Tidak ditemukan");
        navigate("/transaksi", { replace: true });
        return;
      }
      setTx(result.data);
      setFulfillmentStatus(result.data.fulfillment_status || "MENUNGGU");
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  const totals = useMemo(() => {
    if (!tx) return { paid: 0, remaining: 0, due: 0 };
    const paid = tx.transaction_payments.reduce((s, p) => s + p.amount, 0);
    const due = totalTagihan(tx.final_price, tx.transaction_customer_charges);
    return { paid, remaining: Math.max(0, due - paid), due };
  }, [tx]);

  const canEdit = tx?.status === "DP";
  const canPelunasan =
    tx != null &&
    (tx.status === "DP" || tx.status === "MENUNGGU_PELUNASAN");
  const canVoid = role === "OWNER" && tx != null && tx.status !== "BATAL";
  const canDelete = role === "OWNER" && tx != null;
  const isOwner = role === "OWNER";
  const totalHpp = useMemo(
    () => (tx ? tx.hpp_items.reduce((s, h) => s + h.amount, 0) : 0),
    [tx]
  );
  const estimatedProfit = tx ? tx.final_price - totalHpp : 0;

  function handleWhatsAppReminder() {
    if (!tx) return;
    const customer = tx.customer_name || "Pelanggan";
    const amount =
      totals.remaining > 0 ? totals.remaining : totals.due;
    const text = encodeURIComponent(
      `Halo ${customer}, reminder tagihan ${tx.transaction_number} sebesar ${formatCurrency(amount)}. Terima kasih.`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  async function handleFulfillmentChange(status: string) {
    if (!tx) return;
    setIsUpdatingFulfillment(true);
    try {
      const result = await updateFulfillmentStatus({
        id: tx.id,
        fulfillment_status: status as
          | "MENUNGGU"
          | "PRODUKSI"
          | "SIAP_KIRIM"
          | "SELESAI",
      });
      if (!result.success) {
        toast.error(result.message || "Gagal memperbarui status");
        return;
      }
      setFulfillmentStatus(status);
      setTx({ ...tx, fulfillment_status: status });
      emitDataChanged("manual");
      toast.success(result.message);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Terjadi kesalahan"
      );
    } finally {
      setIsUpdatingFulfillment(false);
    }
  }

  async function handleVoid() {
    if (!tx || !id) return;
    if (voidReason.trim().length < 3) {
      toast.error("Alasan pembatalan minimal 3 karakter");
      return;
    }
    setIsVoiding(true);
    try {
      const result = await voidTransaction(id, voidReason.trim());

      if (result.success) {
        toast.success(result.message);
        setVoidDialogOpen(false);
        setVoidReason("");
        emitDataChanged("manual");
        await reloadDetail(id);
      } else {
        toast.error(result.message || "Gagal membatalkan transaksi");
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Gagal membatalkan transaksi"
      );
    } finally {
      setIsVoiding(false);
    }
  }

  async function handlePermanentDelete() {
    if (!tx || !id) return;
    setIsDeleting(true);
    try {
      const result = await deleteTransactionPermanent(id);
      if (!result.success) {
        toast.error(result.message || "Gagal menghapus transaksi");
        setIsDeleting(false);
        return;
      }
      toast.success(result.message);
      emitDataChanged("manual");
      navigate("/transaksi", { replace: true });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Terjadi kesalahan"
      );
      setIsDeleting(false);
    }
  }

  if (loading || !tx) {
    return <TransaksiDetailSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold md:text-3xl">
              {tx.transaction_number}
            </h1>
            <StatusBadge status={tx.status} />
            <FulfillmentBadge status={fulfillmentStatus} />
          </div>
          <p className="text-sm text-muted-foreground">
            Dibuat {formatDate(tx.created_at)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            className="col-span-2 min-h-[44px] gap-2 sm:col-span-1"
            onClick={() => navigate("/transaksi")}
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Button>
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] gap-2"
              onClick={() => navigate(`/transaksi/${tx.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {canVoid && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setVoidDialogOpen(true)}
            >
              <Ban className="h-4 w-4" />
              Batalkan
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Hapus
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] gap-2"
            onClick={() => navigate(`/transaksi/${tx.id}/nota`)}
          >
            <FileText className="h-4 w-4" />
            Nota
          </Button>
          {canPelunasan && (
            <Link
              to={`/transaksi/${tx.id}/pelunasan`}
              className="col-span-2 sm:col-span-1"
            >
              <Button type="button" className="min-h-[44px] w-full gap-2">
                <DollarSign className="h-4 w-4" />
                Input Pelunasan
              </Button>
            </Link>
          )}
          {totals.remaining > 0 && tx.status !== "BATAL" && (
            <Button
              type="button"
              variant="outline"
              onClick={handleWhatsAppReminder}
              className="col-span-2 min-h-[44px] gap-2 border-emerald-500/30 text-emerald-700 sm:col-span-1 dark:text-emerald-400"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="mb-4 text-lg font-bold">Info Transaksi</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Pelanggan
                  </p>
                  <p className="font-semibold">{tx.customer_name || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Deskripsi
                  </p>
                  <p className="font-semibold">{tx.description || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {tx.transaction_customer_charges.length > 0
                      ? "Total Tagihan"
                      : "Harga Jual"}
                  </p>
                  <p className="text-xl font-bold text-primary">
                    {formatCurrency(totals.due)}
                  </p>
                  {tx.transaction_customer_charges.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Barang {formatCurrency(tx.final_price)} + biaya pembeli
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Tipe Pembayaran
                  </p>
                  <p className="font-semibold">
                    {tx.payment_type === "CASH"
                      ? "💵 Cash"
                      : "💳 DP (Uang Muka)"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {tx.status !== "BATAL" && (
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <h3 className="mb-4 text-lg font-bold">Status Pesanan</h3>
                <div className="flex flex-wrap gap-2">
                  {FULFILLMENT_STATUSES.map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant={
                        fulfillmentStatus === opt.value ? "default" : "outline"
                      }
                      disabled={isUpdatingFulfillment}
                      onClick={() => void handleFulfillmentChange(opt.value)}
                      className="min-h-[40px]"
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {tx.transaction_items.length > 0 && (
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <h3 className="mb-4 text-lg font-bold">Item Pesanan</h3>
                <div className="space-y-2">
                  {tx.transaction_items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between rounded-lg border border-border bg-accent/30 p-3"
                    >
                      <div>
                        <p className="font-semibold">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatCurrency(item.line_total)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {tx.transaction_customer_charges.length > 0 && (
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <h3 className="mb-1 text-lg font-bold">
                  Biaya dibebankan ke pembeli
                </h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Masuk nota — tidak dihitung omzet dashboard
                </p>
                <div className="space-y-2">
                  {tx.transaction_customer_charges.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start justify-between rounded-lg border border-border bg-accent/30 p-3"
                    >
                      <p className="font-semibold">{c.name}</p>
                      <p className="font-semibold">{formatCurrency(c.amount)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {isOwner && (
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold">
                    HPP Items
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      (Total: {formatCurrency(totalHpp)})
                    </span>
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/transaksi/${tx.id}/hpp`)}
                    className="gap-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Kelola HPP
                  </Button>
                </div>

                {tx.hpp_items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">Belum ada item HPP</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tambahkan biaya HPP untuk melihat estimasi laba
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 md:hidden">
                      {tx.hpp_items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between rounded-lg border border-border bg-accent/30 p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">{item.name}</p>
                            {item.note && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {item.note}
                              </p>
                            )}
                          </div>
                          <p className="ml-2 shrink-0 font-semibold">
                            {formatCurrency(item.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>Jumlah</TableHead>
                            <TableHead>Catatan</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tx.hpp_items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-semibold">
                                {item.name}
                              </TableCell>
                              <TableCell>
                                {formatCurrency(item.amount)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {item.note || "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}

                {tx.hpp_items.length > 0 && (
                  <div className="mt-4 rounded-lg border border-border bg-accent/30 p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        Estimasi Laba Kotor:
                      </span>
                      <span
                        className={`font-bold ${
                          estimatedProfit >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive"
                        }`}
                      >
                        {formatCurrency(estimatedProfit)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="mb-4 text-lg font-bold">Ringkasan Pembayaran</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Harga barang</span>
                  <span className="font-semibold">
                    {formatCurrency(tx.final_price)}
                  </span>
                </div>
                {tx.transaction_customer_charges.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Biaya pembeli</span>
                    <span className="font-semibold">
                      {formatCurrency(
                        totals.due - tx.final_price
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Tagihan</span>
                  <span className="font-bold">
                    {formatCurrency(totals.due)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Dibayar</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(totals.paid)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-3">
                  <span className="font-semibold">Sisa Tagihan</span>
                  <span
                    className={`text-lg font-bold ${
                      totals.remaining <= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {totals.remaining <= 0
                      ? "✓ Lunas"
                      : formatCurrency(totals.remaining)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="mb-4 text-lg font-bold">Riwayat Pembayaran</h3>
              {tx.transaction_payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <DollarSign className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Belum ada pembayaran
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tx.transaction_payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-accent/30 p-3"
                    >
                      <div>
                        <p className="font-semibold">
                          {formatCurrency(p.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(p.payment_date)} — {p.method}
                        </p>
                        {p.note && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {p.note}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {p.method === "TUNAI" ? "💵" : "🏦"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {tx.status === "BATAL" && (
            <Card className="border-destructive/30 shadow-sm">
              <CardContent className="p-6">
                <h3 className="mb-2 text-lg font-bold text-destructive">
                  Transaksi Dibatalkan
                </h3>
                <p className="text-sm text-muted-foreground">
                  <strong>Alasan:</strong> {tx.void_reason || "—"}
                </p>
                {tx.void_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(tx.void_at)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={voidDialogOpen}
        onOpenChange={(open) => {
          setVoidDialogOpen(open);
          if (!open) setVoidReason("");
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Batalkan Transaksi</DialogTitle>
            <DialogDescription>
              Yakin batalkan transaksi{" "}
              <strong className="text-foreground">{tx.transaction_number}</strong>?
              Data tetap tersimpan, hanya status berubah.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Alasan Pembatalan <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Tuliskan alasan pembatalan..."
              className="min-h-[80px] resize-y"
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setVoidDialogOpen(false);
                setVoidReason("");
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleVoid()}
              disabled={isVoiding || voidReason.trim().length < 3}
            >
              {isVoiding ? "Membatalkan..." : "Ya, Batalkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-[460px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Hapus Transaksi Permanen
            </AlertDialogTitle>
            <AlertDialogDescription>
              Yakin hapus permanen{" "}
              <strong className="text-foreground">{tx.transaction_number}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-lg bg-accent/30 p-3 text-sm">
            <p className="mb-1 font-semibold">Data yang akan ikut terhapus:</p>
            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
              <li>{tx.transaction_payments.length} pembayaran</li>
              <li>{tx.hpp_items.length} item HPP</li>
            </ul>
          </div>

          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <p className="text-xs font-semibold text-destructive">
              ⚠️ Tindakan ini TIDAK BISA DIURUNGKAN.
              {tx.status === "LUNAS" &&
                " Transaksi LUNAS — data keuangan akan hilang!"}
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handlePermanentDelete()}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Menghapus..." : "Ya, Hapus Permanen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
