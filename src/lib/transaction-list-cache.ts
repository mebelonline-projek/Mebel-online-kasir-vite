import type { TransactionRow } from "@/lib/transactions";
import { listRecentTransactions } from "@/lib/transactions";
import {
  offlineDb,
  type CachedTransactionRow,
  type PendingTransaction,
} from "@/lib/offline-db";
import { getWibDateString, wibNoonISO } from "@/lib/date-utils";

const CACHE_LIMIT = 50;

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
  pending: PendingTransaction[]
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
    .map(pendingToRow)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const serverCached = server.map(serverToCached);
  return [...pendingRows, ...serverCached].slice(0, CACHE_LIMIT);
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
    offlineDb.cachedTransactions.orderBy("created_at").reverse().limit(CACHE_LIMIT).toArray(),
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

/**
 * Fetch network + merge pending + tulis cache.
 * Multi-device: selalu network saat online; cache hanya percepat UI lokal.
 */
export async function loadTransactionListLive(
  limit = CACHE_LIMIT
): Promise<CachedTransactionRow[]> {
  if (!navigator.onLine) {
    // Offline: jangan blank — cache device ini + antrean lokal
    return getCachedTransactionList();
  }

  const pending = await getPendingOpen();
  const result = await listRecentTransactions(limit);
  if (!result.success || !result.data) {
    // Jaringan gagal → fallback cache + pending (jangan blank)
    const fallback = await getCachedTransactionList();
    if (fallback.length > 0) return fallback;
    throw new Error(result.message || "Gagal memuat transaksi");
  }

  await saveTransactionListCache(result.data);
  return mergeTransactionRows(result.data, pending);
}
