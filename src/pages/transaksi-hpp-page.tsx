import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { PageListSkeleton } from "@/components/shared/page-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import {
  addHppItem,
  deleteHppItem,
  listHppItems,
  updateHppItem,
  type HppItemRow,
} from "@/lib/hpp";
import { formatCurrency } from "@/lib/formatters";
import { hppItemSchema } from "@/lib/validation";
import { getTransactionById } from "@/lib/transactions";

export function TransaksiHppPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isOwner = role === "OWNER";

  const [transactionNumber, setTransactionNumber] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("");
  const [items, setItems] = useState<HppItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", note: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HppItemRow | null>(null);

  const isBatal = transactionStatus === "BATAL";
  const totalHpp = items.reduce((sum, item) => sum + item.amount, 0);

  useEffect(() => {
    if (!id) return;
    if (!isOwner) {
      navigate(`/transaksi/${id}`, { replace: true });
      return;
    }

    let mounted = true;
    void (async () => {
      setLoading(true);
      const [txResult, hppResult] = await Promise.all([
        getTransactionById(id),
        listHppItems(id),
      ]);
      if (!mounted) return;

      if (!txResult.success || !txResult.data) {
        toast.error(txResult.message || "Transaksi tidak ditemukan");
        navigate("/transaksi", { replace: true });
        return;
      }

      setTransactionNumber(txResult.data.transaction_number);
      setTransactionStatus(txResult.data.status);

      if (hppResult.success && hppResult.data) {
        setItems(hppResult.data);
      } else if (txResult.data.hpp_items) {
        setItems(
          txResult.data.hpp_items.map((h) => ({
            id: h.id,
            transaction_id: id,
            name: h.name,
            amount: h.amount,
            note: h.note,
            created_at: h.created_at || "",
          }))
        );
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [id, isOwner, navigate]);

  const resetForm = () => {
    setForm({ name: "", amount: "", note: "" });
    setFormErrors({});
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (item: HppItemRow) => {
    setForm({
      name: item.name,
      amount: item.amount.toString(),
      note: item.note || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setFormErrors({});

    const payload = {
      transaction_id: id,
      name: form.name,
      amount: Number(form.amount),
      note: form.note || "",
    };

    const parsed = hppItemSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const field = String(issue.path[0] ?? "");
        if (field) errors[field] = issue.message;
      });
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        const result = await updateHppItem(editingId, parsed.data);
        if (!result.success) {
          throw new Error(result.message || "Gagal mengupdate HPP");
        }
        setItems((prev) =>
          prev.map((item) =>
            item.id === editingId
              ? {
                  ...item,
                  name: parsed.data.name,
                  amount: parsed.data.amount,
                  note: parsed.data.note || null,
                }
              : item
          )
        );
        toast.success(result.message);
      } else {
        const result = await addHppItem(parsed.data);
        if (!result.success || !result.data) {
          throw new Error(result.message || "Gagal menambah HPP");
        }
        setItems((prev) => [...prev, result.data!]);
        toast.success(result.message);
      }
      resetForm();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const result = await deleteHppItem(deleteTarget.id);
      if (!result.success) {
        throw new Error(result.message || "Gagal menghapus HPP");
      }
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      toast.success(result.message);
      setDeleteTarget(null);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menghapus HPP"
      );
    }
  };

  if (!isOwner) return null;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageListSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/transaksi/${id}`)}
              className="gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Kembali
            </Button>
            <h1 className="font-mono text-2xl font-bold md:text-3xl">
              {transactionNumber}
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola HPP (Harga Pokok Penjualan)
          </p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Total HPP
            </p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrency(totalHpp)}
            </p>
          </div>
          {!isBatal && (
            <Button
              onClick={() => {
                if (showForm) resetForm();
                else setShowForm(true);
              }}
              className="gap-2"
            >
              {showForm ? (
                <>
                  <X className="h-4 w-4" />
                  Batal
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Tambah HPP
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {showForm && !isBatal && (
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h3 className="mb-4 text-lg font-bold">
              {editingId ? "Edit Item HPP" : "Tambah Item HPP"}
            </h3>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Nama Item <span className="text-destructive">*</span>
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Contoh: Kayu Jati, Cat, Paku, Ongkos Kirim..."
                  className={formErrors.name ? "border-destructive" : ""}
                />
                {formErrors.name && (
                  <p className="text-xs text-destructive">{formErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Jumlah (Rp) <span className="text-destructive">*</span>
                </label>
                <CurrencyInput
                  value={form.amount}
                  onChange={(val) => setForm({ ...form, amount: val })}
                  placeholder="1.000.000"
                  className={formErrors.amount ? "border-destructive" : ""}
                />
                {formErrors.amount && (
                  <p className="text-xs text-destructive">{formErrors.amount}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Catatan</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="flex min-h-[60px] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  placeholder="Catatan opsional..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Batal
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Menyimpan..."
                    : editingId
                      ? "Simpan Perubahan"
                      : "Tambah"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">Belum Ada Item HPP</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Tambahkan biaya HPP untuk menghitung estimasi laba kotor transaksi
              ini.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {items.map((item) => (
              <Card key={item.id} className="shadow-sm">
                <CardContent className="space-y-2 p-4">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(item.amount)}
                  </p>
                  {item.note && (
                    <p className="text-xs text-muted-foreground">{item.note}</p>
                  )}
                  {!isBatal && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden shadow-sm md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Catatan</TableHead>
                    {!isBatal && (
                      <TableHead className="w-[100px]">Aksi</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-semibold">{item.name}</TableCell>
                      <TableCell>{formatCurrency(item.amount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.note || "—"}
                      </TableCell>
                      {!isBatal && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(item)}
                              aria-label="Edit HPP"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(item)}
                              aria-label="Hapus HPP"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-accent/30 p-4">
              <span className="font-bold">Total HPP:</span>
              <span className="text-xl font-bold text-primary">
                {formatCurrency(totalHpp)}
              </span>
            </div>
          </Card>
        </>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Item HPP</AlertDialogTitle>
            <AlertDialogDescription>
              Yakin hapus item HPP{" "}
              <strong className="text-foreground">{deleteTarget?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
