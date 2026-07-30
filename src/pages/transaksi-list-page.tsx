import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle,
  Clock,
  Plus,
  Receipt,
  Search,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLiveData } from "@/hooks/use-live-data";
import type { CachedTransactionRow } from "@/lib/offline-db";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  getCachedTransactionList,
  loadTransactionListLive,
} from "@/lib/transaction-list-cache";

const STATUS_OPTIONS = [
  { value: "semua", label: "Semua" },
  { value: "LUNAS", label: "Lunas" },
  { value: "DP", label: "DP" },
  { value: "MENUNGGU_PELUNASAN", label: "Menunggu Pelunasan" },
  { value: "BATAL", label: "Batal" },
  { value: "GAGAL", label: "Gagal Sync" },
];

function rowsEqual(a: CachedTransactionRow[], b: CachedTransactionRow[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].status !== b[i].status ||
      a[i].final_price !== b[i].final_price ||
      a[i].offlinePending !== b[i].offlinePending
    ) {
      return false;
    }
  }
  return true;
}

function displayStatus(row: CachedTransactionRow) {
  if (row.offlinePending) {
    return row.status === "GAGAL" ? "GAGAL" : "MENYIMPAN";
  }
  return row.status;
}

export function TransaksiListPage() {
  const navigate = useNavigate();
  const { data: rows, loading, refreshing, error } = useLiveData({
    getCached: getCachedTransactionList,
    fetcher: () => loadTransactionListLive(50),
    isEqual: rowsEqual,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [statusValue, setStatusValue] = useState("semua");

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const list = rows ?? [];

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return list.filter((row) => {
      const status = displayStatus(row);
      if (statusValue !== "semua") {
        if (statusValue === "GAGAL") {
          if (!(row.offlinePending && row.status === "GAGAL")) return false;
        } else if (status !== statusValue) {
          return false;
        }
      }
      if (!q) return true;
      const hay = [
        row.transaction_number,
        row.customer_name || "",
        row.description || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [list, searchQuery, statusValue]);

  const stats = useMemo(() => {
    let lunas = 0;
    let menunggu = 0;
    let batal = 0;
    for (const row of list) {
      const s = displayStatus(row);
      if (s === "LUNAS") lunas += 1;
      else if (s === "BATAL" || s === "GAGAL") batal += 1;
      else menunggu += 1;
    }
    return { total: list.length, lunas, menunggu, batal };
  }, [list]);

  const isFiltered = Boolean(searchQuery) || statusValue !== "semua";

  const statCards = [
    {
      label: "Total Transaksi",
      value: stats.total,
      icon: Receipt,
      className: "text-foreground",
    },
    {
      label: "Lunas",
      value: stats.lunas,
      icon: CheckCircle,
      className: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Menunggu",
      value: stats.menunggu,
      icon: Clock,
      className: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Batal",
      value: stats.batal,
      icon: XCircle,
      className: "text-destructive",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Transaksi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola semua transaksi penjualan
            {refreshing ? " · Memperbarui…" : ""}
          </p>
        </div>
        <Link to="/kasir">
          <Button type="button" className="min-h-[44px] gap-2">
            <Plus className="h-4 w-4" />
            Transaksi Baru
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="relative w-full flex-1 sm:max-w-sm">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari transaksi atau nama pelanggan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {searchQuery && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setSearchQuery("")}
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
              variant={statusValue === opt.value ? "default" : "outline"}
              size="xs"
              onClick={() => setStatusValue(opt.value)}
              className="rounded-full text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className={`mt-1 text-xl font-bold ${stat.className}`}>
                    {stat.value}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {loading && list.length === 0 ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : filtered.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Receipt className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">
              {isFiltered
                ? "Transaksi Tidak Ditemukan"
                : "Belum Ada Transaksi"}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {searchQuery
                ? `Tidak ada transaksi dengan kata kunci "${searchQuery}"`
                : "Buat transaksi pertama untuk mulai mencatat penjualan."}
            </p>
            {!isFiltered && (
              <Link to="/kasir" className="mt-4">
                <Button type="button" variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Transaksi Baru
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((tx) => {
              const canOpen = !tx.offlinePending && !tx.id.startsWith("offline:");
              const card = (
                <Card
                  className={`shadow-sm ${canOpen ? "transition-colors hover:bg-accent/30" : ""}`}
                >
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold">
                        {tx.transaction_number}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={displayStatus(tx)} />
                        {tx.offlinePending && tx.status !== "GAGAL" && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-amber-700 uppercase dark:text-amber-400">
                            Offline
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="truncate font-semibold">
                      {tx.customer_name || "Tanpa nama"}
                    </p>
                    {tx.description && (
                      <p className="truncate text-sm text-muted-foreground">
                        {tx.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(tx.created_at)}
                      </span>
                      <span className="font-bold text-primary">
                        {formatCurrency(tx.final_price)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
              return canOpen ? (
                <Link key={tx.id} to={`/transaksi/${tx.id}`} className="block">
                  {card}
                </Link>
              ) : (
                <div key={tx.id}>{card}</div>
              );
            })}
          </div>

          <Card className="hidden overflow-hidden shadow-sm md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Transaksi</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status Bayar</TableHead>
                    <TableHead>Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx) => {
                    const canOpen =
                      !tx.offlinePending && !tx.id.startsWith("offline:");
                    return (
                      <TableRow
                        key={tx.id}
                        className={canOpen ? "cursor-pointer hover:bg-accent/40" : undefined}
                        onClick={() => {
                          if (canOpen) navigate(`/transaksi/${tx.id}`);
                        }}
                      >
                        <TableCell className="font-mono text-sm font-bold">
                          {canOpen ? (
                            <Link
                              to={`/transaksi/${tx.id}`}
                              className="hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {tx.transaction_number}
                            </Link>
                          ) : (
                            tx.transaction_number
                          )}
                          {tx.offlinePending && (
                            <span className="ml-2 text-[10px] font-normal text-amber-700 dark:text-amber-400">
                              offline
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {tx.customer_name || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tx.description || "—"}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(tx.final_price)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={displayStatus(tx)} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(tx.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      <Link
        to="/kasir"
        className="fab-bottom fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
        aria-label="Transaksi baru"
      >
        <Plus className="h-7 w-7" strokeWidth={2.5} />
      </Link>
    </div>
  );
}
