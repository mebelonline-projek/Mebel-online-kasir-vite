import type {
  TransactionListStats,
  TransactionRow,
} from "@/lib/transactions";
import {
  findExistingClientIds,
  getTransactionStatusCounts,
  listRecentTransactions,
  listTransactionsByStatuses,
} from "@/lib/transactions";
import {
  offlineDb,
  type CachedTransactionListStats,
  type CachedTransactionRow,
  type PendingTransaction,
} from "@/lib/offline-db";
import { getWibDateString, wibNoonISO } from "@/lib/date-utils";

export const CACHE_LIMIT = 50;
const STATS_CACHE_ID = "transaction-list-stats" as const;

function pendingToRow(item: PendingTransaction): CachedTransactionRow {
  const isCash = item.payload.payment_type === "CASH";
  const finalPrice = item.payload.final_price;
  const dp = isCash ? finalPrice : item.payload.dp_amount;
  const businessDate =
    item.payload.transaction_date && item.payload.transaction_date.length > 0
      ? item.payload.transaction_date
      : getWibDateString(new Date(item.createdAt));
  return {
    id: `offline:${item.clientId}`,
    transaction_number:
      item.status === "failed" ? "GAGAL SYNC" : "OFFLINE",
    customer_name: item.payload.customer_name ?? null,
    description: item.payload.description ?? null,
    final_price: finalPrice,
    payment_type: item.payload.payment_type,
    dp_amount: dp,
    status: item.status === "failed" ? "GAGAL" : isCash ? "LUNAS" : "DP",
    created_at: wibNoonISO(businessDate),
    client_id: item.clientId,
    offlinePending: true,
    cachedAt: Date.now(),
  };
}

function serverToCached(row: TransactionRow): CachedTransactionRow {
  return {
    ...row,
    offlinePending: false,
    cachedAt: Date.now(),
  };
}

/** Merge server rows + antrean offline. Pending yang sudah ada di server (client_id) digabung. */
export function mergeTransactionRows(
  server: TransactionRow[],
  pending: PendingTransaction[],
  limit = CACHE_LIMIT
): CachedTransactionRow[] {
  const serverClientIds = new Set(
    server.map((r) => r.client_id).filter(Boolean) as string[]
  );
  const pendingRows = pending
    .filter(
      (p) =>
        (p.status === "pending" ||
          p.status === "syncing" ||
          p.status === "failed") &&
        !serverClientIds.has(p.clientId)
    )
    .map(pendingToRow);

  const serverCached = server.map(serverToCached);
  return [...pendingRows, ...serverCached]
    .sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return a.created_at < b.created_at ? 1 : -1;
      }
      // Dalam tanggal sama: pending lokal di awal blok, lalu nomor TRX DESC
      if (Boolean(a.offlinePending) !== Boolean(b.offlinePending)) {
        return a.offlinePending ? -1 : 1;
      }
      if (a.transaction_number !== b.transaction_number) {
        return a.transaction_number < b.transaction_number ? 1 : -1;
      }
      return (b.cachedAt || 0) - (a.cachedAt || 0);
    })
    .slice(0, limit);
}

export async function getPendingOpen(): Promise<PendingTransaction[]> {
  if (!offlineDb) return [];
  return offlineDb.pendingTransactions
    .where("status")
    .anyOf(["pending", "syncing", "failed"])
    .sortBy("createdAt");
}

/** Paint instan dari Dexie (cache server terakhir + pending lokal). */
export async function getCachedTransactionList(): Promise<CachedTransactionRow[]> {
  if (!offlineDb) return [];
  const [cached, pending] = await Promise.all([
    offlineDb.cachedTransactions
      .orderBy("created_at")
      .reverse()
      .limit(CACHE_LIMIT)
      .toArray(),
    getPendingOpen(),
  ]);
  const asServer: TransactionRow[] = cached
    .filter((r) => !r.offlinePending)
    .map(({ offlinePending: _o, cachedAt: _c, ...rest }) => rest);
  return mergeTransactionRows(asServer, pending);
}

/** Simpan hasil network ke Dexie supaya device ini buka list tanpa tunggu. */
export async function saveTransactionListCache(
  rows: TransactionRow[]
): Promise<void> {
  if (!offlineDb) return;
  const now = Date.now();
  const mapped = rows.slice(0, CACHE_LIMIT).map((r) => ({
    ...r,
    offlinePending: false as const,
    cachedAt: now,
  }));
  await offlineDb.transaction("rw", offlineDb.cachedTransactions, async () => {
    await offlineDb!.cachedTransactions.clear();
    if (mapped.length > 0) {
      await offlineDb!.cachedTransactions.bulkPut(mapped);
    }
  });
}

export type TransactionListLoadOptions = {
  limit?: number;
  /** null/undefined = recent semua status; array = filter status server. */
  statuses?: string[] | null;
};

/**
 * Fetch network + merge pending + tulis cache (hanya untuk list unfiltered).
 * Multi-device: selalu network saat online; cache hanya percepat UI lokal.
 */
export async function loadTransactionListLive(
  options: number | TransactionListLoadOptions = CACHE_LIMIT
): Promise<CachedTransactionRow[]> {
  const opts: TransactionListLoadOptions =
    typeof options === "number" ? { limit: options } : options;
  const limit = opts.limit ?? CACHE_LIMIT;
  const statuses = opts.statuses ?? null;
  const filtered = Boolean(statuses && statuses.length > 0);

  if (!navigator.onLine) {
    const cached = await getCachedTransactionList();
    if (!filtered) return cached;
    return cached.filter((row) => statuses!.includes(row.status));
  }

  const pending = await getPendingOpen();
  const result = filtered
    ? await listTransactionsByStatuses(statuses!, limit)
    : await listRecentTransactions(limit);

  if (!result.success || !result.data) {
    const fallback = await getCachedTransactionList();
    if (fallback.length > 0) {
      return filtered
        ? fallback.filter((row) => statuses!.includes(row.status))
        : fallback;
    }
    throw new Error(result.message || "Gagal memuat transaksi");
  }

  // Jangan overwrite cache recent-50 dengan hasil filter status.
  if (!filtered) {
    await saveTransactionListCache(result.data);
  }
  return mergeTransactionRows(result.data, pending, limit);
}

function emptyStats(): TransactionListStats {
  return { total: 0, lunas: 0, menunggu: 0, batal: 0 };
}

function addPendingToStats(
  base: TransactionListStats,
  pending: PendingTransaction[]
): TransactionListStats {
  const next = { ...base };
  for (const item of pending) {
    if (
      item.status !== "pending" &&
      item.status !== "syncing" &&
      item.status !== "failed"
    ) {
      continue;
    }
    next.total += 1;
    if (item.status === "failed") {
      // Gagal sync — bukan BATAL DB; masuk bucket Batal kartu + chip Gagal Sync.
      next.batal += 1;
    } else if (item.payload.payment_type === "CASH") {
      next.lunas += 1;
    } else {
      next.menunggu += 1;
    }
  }
  return next;
}

async function pendingForStats(
  pending: PendingTransaction[]
): Promise<PendingTransaction[]> {
  if (pending.length === 0) return [];

  const cachedClientIds = new Set<string>();
  if (offlineDb) {
    const cached = await offlineDb.cachedTransactions.toArray();
    for (const row of cached) {
      if (row.client_id) cachedClientIds.add(row.client_id);
    }
  }

  const open = pending.filter(
    (p) =>
      (p.status === "pending" ||
        p.status === "syncing" ||
        p.status === "failed") &&
      !cachedClientIds.has(p.clientId)
  );

  if (open.length === 0 || !navigator.onLine) return open;

  const onServer = await findExistingClientIds(open.map((p) => p.clientId));
  return open.filter((p) => !onServer.has(p.clientId));
}

function statsFromCachedRows(
  rows: CachedTransactionRow[]
): TransactionListStats {
  let lunas = 0;
  let menunggu = 0;
  let batal = 0;
  for (const row of rows) {
    const s = row.status;
    if (s === "LUNAS") lunas += 1;
    else if (s === "BATAL" || s === "GAGAL") batal += 1;
    else menunggu += 1;
  }
  return { total: rows.length, lunas, menunggu, batal };
}

export async function saveTransactionListStatsCache(
  stats: TransactionListStats
): Promise<void> {
  if (!offlineDb) return;
  const row: CachedTransactionListStats = {
    id: STATS_CACHE_ID,
    ...stats,
    cachedAt: Date.now(),
  };
  await offlineDb.cachedTransactionListStats.put(row);
}

/** Paint instan: last known DB counts + pending lokal yang belum di server. */
export async function getCachedTransactionListStats(): Promise<TransactionListStats> {
  if (!offlineDb) return emptyStats();
  const [cached, pending, recent] = await Promise.all([
    offlineDb.cachedTransactionListStats.get(STATS_CACHE_ID),
    getPendingOpen(),
    offlineDb.cachedTransactions
      .orderBy("created_at")
      .reverse()
      .limit(CACHE_LIMIT)
      .toArray(),
  ]);

  const pendingUnique = await pendingForStats(pending);

  if (cached) {
    const { id: _id, cachedAt: _c, ...counts } = cached;
    return addPendingToStats(counts, pendingUnique);
  }

  // Belum pernah fetch count penuh — fallback window cache (bisa undercount).
  const asServer: TransactionRow[] = recent
    .filter((r) => !r.offlinePending)
    .map(({ offlinePending: _o, cachedAt: _c, ...rest }) => rest);
  return statsFromCachedRows(mergeTransactionRows(asServer, pendingUnique));
}

/**
 * Count penuh dari DB + pending lokal. Cache last-known untuk offline.
 */
export async function loadTransactionListStatsLive(): Promise<TransactionListStats> {
  if (!navigator.onLine) {
    return getCachedTransactionListStats();
  }

  const pending = await getPendingOpen();
  const pendingUnique = await pendingForStats(pending);
  const result = await getTransactionStatusCounts();
  if (!result.success || !result.data) {
    const fallback = await getCachedTransactionListStats();
    if (fallback.total > 0 || pendingUnique.length > 0) return fallback;
    throw new Error(result.message || "Gagal menghitung transaksi");
  }

  await saveTransactionListStatsCache(result.data);
  return addPendingToStats(result.data, pendingUnique);
}

/** Map chip filter → status DB (null = semua / recent). */
export function statusesForFilter(
  statusValue: string
): string[] | null {
  switch (statusValue) {
    case "semua":
      return null;
    case "belum_lunas":
      return ["DP", "MENUNGGU_PELUNASAN"];
    case "LUNAS":
    case "DP":
    case "MENUNGGU_PELUNASAN":
    case "BATAL":
      return [statusValue];
    case "GAGAL":
      return null; // lokal saja
    default:
      return null;
  }
}
