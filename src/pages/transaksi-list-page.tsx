import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle,
  Clock,
  Download,
  Eye,
  Plus,
  Receipt,
  Search,
  XCircle,
} from "lucide-react";
import { FulfillmentBadge } from "@/components/shared/fulfillment-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageListSkeleton } from "@/components/shared/page-skeleton";
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
import { FULFILLMENT_STATUSES } from "@/config/fulfillment";
import { useAuth } from "@/contexts/auth-context";
import { useLiveData } from "@/hooks/use-live-data";
import { downloadCsv } from "@/lib/export-csv";
import type { CachedTransactionRow } from "@/lib/offline-db";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { TransactionListStats } from "@/lib/transactions";
import {
  CACHE_LIMIT,
  getCachedTransactionList,
  getCachedTransactionListStats,
  loadTransactionListLive,
  loadTransactionListStatsLive,
  statusesForFilter,
} from "@/lib/transaction-list-cache";

const STATUS_OPTIONS = [
  { value: "semua", label: "Semua" },
  { value: "LUNAS", label: "Lunas" },
  { value: "belum_lunas", label: "Belum Lunas" },
  { value: "BATAL", label: "Batal" },
];

function rowsEqual(a: CachedTransactionRow[], b: CachedTransactionRow[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].status !== b[i].status ||
      a[i].fulfillment_status !== b[i].fulfillment_status ||
      a[i].final_price !== b[i].final_price ||
      a[i].offlinePending !== b[i].offlinePending
    ) {
      return false;
    }
  }
  return true;
}

function statsEqual(a: TransactionListStats, b: TransactionListStats) {
  return (
    a.total === b.total &&
    a.lunas === b.lunas &&
    a.menunggu === b.menunggu &&
    a.batal === b.batal
  );
}

function displayStatus(row: CachedTransactionRow) {
  if (row.offlinePending) {
    return row.status === "GAGAL" ? "GAGAL" : "MENYIMPAN";
  }
  return row.status;
}

/** Status untuk filter (pakai status DB, bukan label MENYIMPAN). */
function filterStatus(row: CachedTransactionRow) {
  return row.status;
}

function matchesStatusFilter(
  row: CachedTransactionRow,
  statusValue: string
): boolean {
  if (statusValue === "semua") return true;
  if (statusValue === "belum_lunas") {
    return (
      filterStatus(row) === "DP" || filterStatus(row) === "MENUNGGU_PELUNASAN"
    );
  }
  if (statusValue === "BATAL") {
    return (
      filterStatus(row) === "BATAL" ||
      (row.offlinePending === true && row.status === "GAGAL")
    );
  }
  return filterStatus(row) === statusValue;
}

/** Map filter URL lama (DP / Menunggu Pelunasan / Gagal) ke chip baru. */
function normalizeStatusFilter(raw: string | null): string {
  if (!raw || raw === "semua") return "semua";
  if (raw === "DP" || raw === "MENUNGGU_PELUNASAN" || raw === "belum_lunas") {
    return "belum_lunas";
  }
  if (raw === "GAGAL") return "BATAL";
  if (raw === "LUNAS" || raw === "BATAL") return raw;
  return "semua";
}

export function TransaksiListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const isOwner = role === "OWNER";

  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get("q") || ""
  );
  const [debouncedQ, setDebouncedQ] = useState(
    () => (searchParams.get("q") || "").trim()
  );
  const [statusValue, setStatusValue] = useState(
    () => normalizeStatusFilter(searchParams.get("status"))
  );
  const [fulfillmentValue, setFulfillmentValue] = useState(
    () => searchParams.get("fulfillment") || "semua"
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const {
    data: rows,
    loading,
    refreshing,
    error,
    refresh,
  } = useLiveData({
    getCached: getCachedTransactionList,
    fetcher: () =>
      loadTransactionListLive({
        limit: debouncedQ ? undefined : CACHE_LIMIT,
        statuses: statusesForFilter(statusValue),
        q: debouncedQ || null,
      }),
    isEqual: rowsEqual,
  });

  const { data: stats, error: statsError } = useLiveData({
    getCached: getCachedTransactionListStats,
    fetcher: loadTransactionListStatsLive,
    isEqual: statsEqual,
  });

  useEffect(() => {
    void refresh();
  }, [statusValue, debouncedQ, refresh]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (statsError) toast.error(statsError);
  }, [statsError]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (searchQuery.trim()) next.set("q", searchQuery.trim());
    if (statusValue !== "semua") next.set("status", statusValue);
    if (fulfillmentValue !== "semua") next.set("fulfillment", fulfillmentValue);
    const nextStr = next.toString();
    const curStr = searchParams.toString();
    if (nextStr !== curStr) {
      setSearchParams(next, { replace: true });
    }
  }, [searchQuery, statusValue, fulfillmentValue, searchParams, setSearchParams]);

  const list = rows ?? [];
  const displayStats: TransactionListStats = stats ?? {
    total: 0,
    lunas: 0,
    menunggu: 0,
    batal: 0,
  };

  const filtered = useMemo(() => {
    // Teks sudah di-query server (atau cache offline); sisa filter status + pesanan.
    return list.filter((row) => {
      if (!matchesStatusFilter(row, statusValue)) return false;
      if (fulfillmentValue !== "semua") {
        if (filterStatus(row) === "BATAL") return false;
        const f = row.fulfillment_status || "MENUNGGU";
        if (f !== fulfillmentValue) return false;
      }
      return true;
    });
  }, [list, statusValue, fulfillmentValue]);

  const isFiltered =
    Boolean(searchQuery) ||
    statusValue !== "semua" ||
    fulfillmentValue !== "semua";

  function handleExportCsv() {
    downloadCsv(`transaksi-${new Date().toISOString().slice(0, 10)}.csv`, [
      [
        "No Transaksi",
        "Pelanggan",
        "Deskripsi",
        "Harga",
        "Bayar",
        "Pesanan",
        "Tanggal",
      ],
      ...filtered.map((tx) => [
        tx.transaction_number,
        tx.customer_name || "",
        tx.description || "",
        tx.final_price.toString(),
        displayStatus(tx),
        tx.fulfillment_status || "MENUNGGU",
        tx.created_at,
      ]),
    ]);
    toast.success("CSV berhasil diunduh");
  }

  const emptyHint = debouncedQ
    ? `Tidak ada transaksi dengan kata kunci "${debouncedQ}"`
    : statusValue !== "semua" || fulfillmentValue !== "semua"
      ? "Tidak ada transaksi untuk filter ini. Coba Reset."
      : "Buat transaksi pertama untuk mulai mencatat penjualan.";

  const statCards = [
    {
      label: "Total Transaksi",
      value: displayStats.total,
      icon: Receipt,
      className: "text-foreground",
      filter: "semua" as const,
    },
    {
      label: "Lunas",
      value: displayStats.lunas,
      icon: CheckCircle,
      className: "text-emerald-600 dark:text-emerald-400",
      filter: "LUNAS" as const,
    },
    {
      label: "Belum Lunas",
      value: displayStats.menunggu,
      icon: Clock,
      className: "text-amber-600 dark:text-amber-400",
      filter: "belum_lunas" as const,
    },
    {
      label: "Batal",
      value: displayStats.batal,
      icon: XCircle,
      className: "text-destructive",
      filter: "BATAL" as const,
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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {isOwner && filtered.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] gap-2"
              onClick={handleExportCsv}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
          <Link to="/kasir">
            <Button type="button" className="min-h-[44px] w-full gap-2 sm:w-auto">
              <Plus className="h-4 w-4" />
              Transaksi Baru
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setDebouncedQ(searchQuery.trim());
          }}
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
          <Button type="submit" variant="secondary">
            Cari
          </Button>
          {(searchQuery ||
            statusValue !== "semua" ||
            fulfillmentValue !== "semua") && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setStatusValue("semua");
                setFulfillmentValue("semua");
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
              variant={statusValue === opt.value ? "default" : "outline"}
              size="xs"
              onClick={() => setStatusValue(opt.value)}
              className="rounded-full text-xs"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 self-center text-xs text-muted-foreground">
            Pesanan:
          </span>
          <Button
            type="button"
            variant={fulfillmentValue === "semua" ? "default" : "outline"}
            size="xs"
            onClick={() => setFulfillmentValue("semua")}
            className="rounded-full text-xs"
          >
            Semua
          </Button>
          {FULFILLMENT_STATUSES.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={
                fulfillmentValue === opt.value ? "default" : "outline"
              }
              size="xs"
              onClick={() => setFulfillmentValue(opt.value)}
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
          const active = statusValue === stat.filter;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => setStatusValue(stat.filter)}
              className="text-left"
            >
              <Card
                className={`shadow-sm transition-colors ${
                  active
                    ? "border-primary ring-1 ring-primary/40"
                    : "hover:bg-accent/30"
                }`}
              >
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
            </button>
          );
        })}
      </div>

      {loading && list.length === 0 ? (
        <PageListSkeleton />
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
            <p className="max-w-sm text-sm text-muted-foreground">{emptyHint}</p>
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
              const canOpen =
                !tx.offlinePending && !tx.id.startsWith("offline:");
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
                        {displayStatus(tx) !== "BATAL" && (
                          <FulfillmentBadge
                            status={tx.fulfillment_status || "MENUNGGU"}
                          />
                        )}
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
                    <TableHead>Pesanan</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="w-[60px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx) => {
                    const canOpen =
                      !tx.offlinePending && !tx.id.startsWith("offline:");
                    return (
                      <TableRow
                        key={tx.id}
                        className={
                          canOpen
                            ? "cursor-pointer hover:bg-accent/40"
                            : undefined
                        }
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
                        <TableCell>
                          {displayStatus(tx) !== "BATAL" ? (
                            <FulfillmentBadge
                              status={tx.fulfillment_status || "MENUNGGU"}
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(tx.created_at)}
                        </TableCell>
                        <TableCell>
                          {canOpen && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/transaksi/${tx.id}`);
                              }}
                              aria-label="Lihat detail"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
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
