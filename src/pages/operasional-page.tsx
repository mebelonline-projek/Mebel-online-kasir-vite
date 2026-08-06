import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  Wallet,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  createOperationalCost,
  deleteOperationalCost,
  listOperationalCosts,
  updateOperationalCost,
  type OperationalCostRow,
} from "@/lib/operational-costs";
import {
  getTransactionDateBounds,
  wibNoonISO,
} from "@/lib/date-utils";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { operationalCostSchema } from "@/lib/validation";

function formatCostDate(periodStart: string) {
  return formatDate(wibNoonISO(periodStart));
}

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function generateMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

const MONTH_OPTIONS = generateMonthOptions();

function getDefaultBulan(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type CostForm = {
  name: string;
  amount: string;
  category: string;
};

const emptyForm: CostForm = { name: "", amount: "", category: "" };

export function OperasionalPage() {
  const { role } = useAuth();
  const isOwner = role === "OWNER";
  const [searchParams, setSearchParams] = useSearchParams();

  const bulan = searchParams.get("bulan") || getDefaultBulan();
  const dari = searchParams.get("dari") || "";
  const sampai = searchParams.get("sampai") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [costs, setCosts] = useState<OperationalCostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [distinctCategories, setDistinctCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<OperationalCostRow | null>(
    null
  );
  const [deletingCost, setDeletingCost] = useState<OperationalCostRow | null>(
    null
  );
  const [form, setForm] = useState<CostForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [customDari, setCustomDari] = useState(dari);
  const [customSampai, setCustomSampai] = useState(sampai);
  const dateBounds = useMemo(() => getTransactionDateBounds(), []);
  const [costDate, setCostDate] = useState(dateBounds.today);
  const isBackdated = costDate !== dateBounds.today;

  useEffect(() => {
    setCustomDari(dari);
    setCustomSampai(sampai);
  }, [dari, sampai]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listOperationalCosts({
      bulan: dari && sampai ? undefined : bulan,
      dari: dari || undefined,
      sampai: sampai || undefined,
      page,
    });
    if (!result.success || !result.data) {
      toast.error(result.message || "Gagal memuat");
      setCosts([]);
      setTotal(0);
      setTotalPages(0);
      setDistinctCategories([]);
    } else {
      setCosts(result.data.costs);
      setTotal(result.data.total);
      setTotalPages(result.data.totalPages);
      setDistinctCategories(result.data.distinctCategories);
    }
    setLoading(false);
  }, [bulan, dari, sampai, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function syncUrl(next: {
    bulan?: string;
    dari?: string;
    sampai?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    if (next.dari && next.sampai) {
      params.set("dari", next.dari);
      params.set("sampai", next.sampai);
    } else {
      params.set("bulan", next.bulan || getDefaultBulan());
    }
    params.set("page", String(next.page ?? 1));
    setSearchParams(params, { replace: true });
  }

  function handleBulanChange(value: string) {
    syncUrl({ bulan: value, page: 1 });
  }

  function applyCustomRange() {
    if (!customDari || !customSampai) {
      toast.error("Isi tanggal dari dan sampai");
      return;
    }
    syncUrl({ dari: customDari, sampai: customSampai, page: 1 });
  }

  function clearCustomRange() {
    setCustomDari("");
    setCustomSampai("");
    syncUrl({ bulan, page: 1 });
  }

  function resetForm() {
    setForm(emptyForm);
    setFormErrors({});
    setEditingCost(null);
    setCostDate(getTransactionDateBounds().today);
  }

  function openAddModal() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditModal(cost: OperationalCostRow) {
    setEditingCost(cost);
    setForm({
      name: cost.name,
      amount: cost.amount.toString(),
      category: cost.category || "",
    });
    setFormErrors({});
    setDialogOpen(true);
  }

  function validateForm(): boolean {
    try {
      operationalCostSchema.parse({
        ...form,
        amount: Number(form.amount),
        ...(editingCost ? {} : { cost_date: costDate }),
      });
      setFormErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.issues.forEach((err) => {
          const field = err.path[0] as string;
          if (!errors[field]) errors[field] = err.message;
        });
        setFormErrors(errors);
      }
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const payload = editingCost
        ? {
            name: form.name,
            amount: Number(form.amount),
            category: form.category || "LAINNYA",
          }
        : {
            name: form.name,
            amount: Number(form.amount),
            category: form.category || "LAINNYA",
            cost_date: costDate,
          };

      const result = editingCost
        ? await updateOperationalCost(editingCost.id, payload)
        : await createOperationalCost(payload);

      if (!result.success) {
        toast.error(result.message);
      } else {
        toast.success(result.message);
        setDialogOpen(false);
        resetForm();
        await load();
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deletingCost) return;
    setIsDeleting(true);
    try {
      const result = await deleteOperationalCost(deletingCost.id);
      if (!result.success) {
        toast.error(result.message);
      } else {
        toast.success(result.message);
        setDeleteDialogOpen(false);
        setDeletingCost(null);
        await load();
      }
    } catch {
      toast.error("Terjadi kesalahan saat menghapus");
    } finally {
      setIsDeleting(false);
    }
  }

  function goToPage(nextPage: number) {
    if (dari && sampai) {
      syncUrl({ dari, sampai, page: nextPage });
    } else {
      syncUrl({ bulan, page: nextPage });
    }
  }

  const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
  const periodLabel =
    dari && sampai
      ? `${dari} s/d ${sampai}`
      : MONTH_OPTIONS.find((o) => o.value === bulan)?.label || bulan;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Biaya Operasional
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Catat pengeluaran toko
          </p>
        </div>
        <Button onClick={openAddModal} className="gap-2">
          <Plus className="h-4 w-4" />
          Tambah Biaya
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="shrink-0 text-sm font-medium text-muted-foreground">
            Bulan:
          </label>
          <select
            value={bulan}
            onChange={(e) => handleBulanChange(e.target.value)}
            disabled={Boolean(dari && sampai)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-auto"
          >
            {MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Dari tanggal</label>
            <Input
              type="date"
              value={customDari}
              onChange={(e) => setCustomDari(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">
              Sampai tanggal
            </label>
            <Input
              type="date"
              value={customSampai}
              onChange={(e) => setCustomSampai(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={applyCustomRange}
            className="min-h-[40px]"
          >
            Terapkan
          </Button>
          {(dari || sampai) && (
            <Button
              type="button"
              variant="outline"
              onClick={clearCustomRange}
              className="min-h-[40px]"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {loading && costs.length === 0 ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-64 rounded-xl bg-muted/50" />
        </div>
      ) : costs.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Wallet className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">
              Belum Ada Biaya {periodLabel}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Belum ada catatan pengeluaran untuk bulan ini.
            </p>
            <Button
              onClick={openAddModal}
              variant="outline"
              className="mt-4 gap-2"
            >
              <Plus className="h-4 w-4" />
              Tambah Biaya
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-primary/10 bg-primary/5 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Total Biaya {periodLabel}
              </p>
              <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
            </CardContent>
          </Card>

          <div className="space-y-3 md:hidden">
            {costs.map((cost) => (
              <Card key={cost.id} className="shadow-sm">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {cost.category || "LAINNYA"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatCostDate(cost.period_start)}
                    </span>
                  </div>
                  <p className="font-semibold">{cost.name}</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(cost.amount)}
                  </p>
                  {isOwner && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(cost)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          setDeletingCost(cost);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Hapus
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
                    <TableHead>Kategori</TableHead>
                    <TableHead>Nama Biaya</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Tanggal</TableHead>
                    {isOwner && (
                      <TableHead className="w-[80px]">Aksi</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map((cost) => (
                    <TableRow key={cost.id}>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {cost.category || "LAINNYA"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {cost.name}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(cost.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatCostDate(cost.period_start)}
                      </TableCell>
                      {isOwner && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditModal(cost)}
                              aria-label="Edit biaya"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                setDeletingCost(cost);
                                setDeleteDialogOpen(true);
                              }}
                              aria-label="Hapus biaya"
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
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Halaman {page} dari {totalPages} ({total} biaya)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                  className="gap-1"
                >
                  Selanjutnya
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {editingCost ? "Edit Biaya" : "Tambah Biaya"}
            </DialogTitle>
            <DialogDescription>
              {editingCost
                ? "Ubah nama atau jumlah biaya."
                : "Catat pengeluaran toko."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Nama Biaya <span className="text-destructive">*</span>
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Listrik bulan ini"
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
              <label className="text-sm font-medium">Kategori</label>
              <Input
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value })
                }
                placeholder="Contoh: LISTRIK, SEWA (ketik manual atau pilih di bawah)"
                className={formErrors.category ? "border-destructive" : ""}
              />
              {formErrors.category && (
                <p className="text-xs text-destructive">{formErrors.category}</p>
              )}
              {distinctCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {distinctCategories.map((cat) => (
                    <Button
                      key={cat}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setForm({ ...form, category: cat })}
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {!editingCost && (
              <div className="space-y-1.5">
                <label htmlFor="cost_date" className="text-sm font-medium">
                  Tanggal biaya
                </label>
                <Input
                  id="cost_date"
                  type="date"
                  value={costDate}
                  min={dateBounds.min}
                  max={dateBounds.today}
                  onChange={(e) => setCostDate(e.target.value)}
                  className={formErrors.cost_date ? "border-destructive" : ""}
                />
                {formErrors.cost_date && (
                  <p className="text-xs text-destructive">
                    {formErrors.cost_date}
                  </p>
                )}
                {isBackdated && (
                  <p className="text-xs text-muted-foreground">
                    Mundur ke{" "}
                    {new Date(wibNoonISO(costDate)).toLocaleDateString(
                      "id-ID",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        timeZone: "Asia/Jakarta",
                      }
                    )}
                    . Biaya masuk ke periode tanggal tersebut.
                  </p>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Menyimpan..."
                  : editingCost
                    ? "Simpan"
                    : "Tambah"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Biaya</AlertDialogTitle>
            <AlertDialogDescription>
              Yakin ingin menghapus{" "}
              <strong className="text-foreground">{deletingCost?.name}</strong>?
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
