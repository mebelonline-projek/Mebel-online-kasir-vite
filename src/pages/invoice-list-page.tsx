import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
  getInvoices,
  type InvoiceListItem,
} from "@/lib/invoices";
import { formatCurrency, formatDate } from "@/lib/formatters";

const STATUS_OPTIONS = [
  { value: "semua", label: "Semua" },
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Terkirim" },
  { value: "PAID", label: "Lunas" },
  { value: "CANCELLED", label: "Batal" },
];

function statusBadgeClass(status: string) {
  if (status === "PAID") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  }
  if (status === "DRAFT") return "bg-muted text-muted-foreground";
  if (status === "SENT") return "bg-primary/10 text-primary";
  return "bg-destructive/10 text-destructive";
}

export function InvoiceListPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isOwner = role === "OWNER";

  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [status, setStatus] = useState(
    () => searchParams.get("status") || "semua"
  );
  const [page, setPage] = useState(() =>
    parseInt(searchParams.get("page") || "1", 10)
  );
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    number: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getInvoices({ q, status, page, limit: 10 });
    if (!result.success || !result.data) {
      toast.error(result.message || "Gagal memuat invoice");
      setInvoices([]);
      setTotal(0);
      setTotalPages(0);
    } else {
      setInvoices(result.data.data);
      setTotal(result.data.total);
      setTotalPages(result.data.totalPages);
    }
    setLoading(false);
  }, [q, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status && status !== "semua") next.set("status", status);
    if (page > 1) next.set("page", String(page));
    setSearchParams(next, { replace: true });
  }, [q, status, page, setSearchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQ(searchQuery);
    setPage(1);
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteInvoice(deleteTarget.id);
    if (!result.success) {
      toast.error(result.message || "Gagal menghapus invoice");
      return;
    }
    toast.success(result.message);
    setDeleteTarget(null);
    void load();
  };

  const isFiltered = Boolean(q) || status !== "semua";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Invoice
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola faktur & surat tagihan pelanggan
          </p>
        </div>
        <Link to="/invoice/buat">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Buat Invoice
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <form
          onSubmit={handleSearch}
          className="flex w-full flex-1 flex-col gap-2 sm:flex-row"
        >
          <div className="relative w-full flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari invoice atau pelanggan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Cari
          </Button>
          {searchQuery && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setQ("");
                setPage(1);
              }}
            >
              Reset
            </Button>
          )}
        </form>

        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={status === opt.value ? "default" : "outline"}
              size="xs"
              onClick={() => handleStatusChange(opt.value)}
              className="rounded-full text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {loading && invoices.length === 0 ? (
        <div className="animate-pulse space-y-4">
          <div className="h-10 rounded bg-muted" />
          <div className="h-64 rounded-xl bg-muted/50" />
        </div>
      ) : invoices.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">
              {isFiltered ? "Invoice Tidak Ditemukan" : "Belum Ada Invoice"}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {q
                ? `Tidak ada invoice dengan kata kunci "${q}"`
                : "Buat invoice untuk pelanggan yang membutuhkan faktur."}
            </p>
            {!isFiltered && (
              <Link to="/invoice/buat" className="mt-4">
                <Button variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Buat Invoice Pertama
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {invoices.map((inv) => (
              <Card
                key={inv.id}
                className="cursor-pointer shadow-sm transition-transform active:scale-[0.99]"
                onClick={() => navigate(`/invoice/${inv.id}`)}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">
                      {inv.invoice_number}
                    </span>
                    <Badge className={statusBadgeClass(inv.status)}>
                      {inv.status}
                    </Badge>
                  </div>
                  <p className="font-semibold">{inv.customer_name || "—"}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-semibold">
                        {formatCurrency(inv.total_amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sisa</p>
                      <p
                        className={
                          inv.remaining_amount > 0
                            ? "font-semibold text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        }
                      >
                        {inv.remaining_amount > 0
                          ? formatCurrency(inv.remaining_amount)
                          : "Lunas"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(inv.created_at)}
                    </span>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({
                            id: inv.id,
                            number: inv.invoice_number,
                          });
                        }}
                        aria-label="Hapus invoice"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden shadow-sm md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Dibayar</TableHead>
                    <TableHead>Sisa</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="w-[80px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/invoice/${inv.id}`)}
                    >
                      <TableCell className="font-mono text-sm font-bold">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {inv.customer_name || "—"}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(inv.total_amount)}
                      </TableCell>
                      <TableCell className="text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(inv.total_paid)}
                      </TableCell>
                      <TableCell
                        className={
                          inv.remaining_amount > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        }
                      >
                        {inv.remaining_amount > 0
                          ? formatCurrency(inv.remaining_amount)
                          : "Lunas"}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(inv.status)}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(inv.created_at)}
                      </TableCell>
                      <TableCell>
                        {isOwner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({
                                id: inv.id,
                                number: inv.invoice_number,
                              });
                            }}
                            aria-label="Hapus invoice"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Halaman {page} dari {totalPages} ({total} invoice)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              Yakin hapus invoice{" "}
              <strong className="text-foreground">{deleteTarget?.number}</strong>?
              Data akan hilang permanen.
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
