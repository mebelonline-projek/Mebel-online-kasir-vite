import { toast } from "sonner";
import type { PendingTransaction } from "@/lib/offline-db";
import { offlineDb } from "@/lib/offline-db";
import { createTransaction } from "@/lib/transactions";
import type { TransactionCreateValues } from "@/lib/validation";
import { emitDataChanged } from "@/lib/data-events";

let isSyncing = false;

export async function flushPendingTransactions(): Promise<number> {
  if (!offlineDb || isSyncing || !navigator.onLine) return 0;

  const pending = await offlineDb.pendingTransactions
    .where("status")
    .anyOf(["pending", "failed"])
    .sortBy("createdAt");

  if (pending.length === 0) return 0;

  isSyncing = true;
  let synced = 0;

  try {
    for (const item of pending) {
      await offlineDb.pendingTransactions.update(item.clientId, {
        status: "syncing",
        errorMessage: undefined,
      });
      emitDataChanged("sync");

      try {
        const result = await createTransaction({
          ...item.payload,
          client_id: item.clientId,
        });

        if (!result.success) {
          throw new Error(result.message || "Gagal sync transaksi");
        }

        await offlineDb.pendingTransactions.update(item.clientId, {
          status: "synced",
        });
        synced += 1;
        emitDataChanged("sync");
      } catch (error) {
        await offlineDb.pendingTransactions.update(item.clientId, {
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Sync gagal",
        });
        emitDataChanged("sync");
      }
    }

    if (synced > 0) {
      toast.success(`${synced} transaksi offline berhasil disinkronkan`);
      emitDataChanged("sync");
    }
  } finally {
    isSyncing = false;
  }

  return synced;
}

export async function queueOfflineTransaction(
  payload: TransactionCreateValues
): Promise<string> {
  if (!offlineDb) throw new Error("Offline database tidak tersedia");

  const clientId = crypto.randomUUID();
  const row: PendingTransaction = {
    clientId,
    payload: { ...payload, client_id: clientId },
    status: "pending",
    createdAt: Date.now(),
  };
  await offlineDb.pendingTransactions.add(row);
  emitDataChanged("create");
  return clientId;
}

export async function getPendingCount(): Promise<number> {
  if (!offlineDb) return 0;
  return offlineDb.pendingTransactions
    .where("status")
    .anyOf(["pending", "failed"])
    .count();
}

export function setupOfflineSyncListeners(): () => void {
  const handleOnline = () => {
    void flushPendingTransactions();
  };

  const handleVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (!navigator.onLine) return;
    void getPendingCount().then((count) => {
      if (count > 0) void flushPendingTransactions();
    });
  };

  window.addEventListener("online", handleOnline);
  document.addEventListener("visibilitychange", handleVisible);
  window.addEventListener("focus", handleVisible);

  if (navigator.onLine) {
    void flushPendingTransactions();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    document.removeEventListener("visibilitychange", handleVisible);
    window.removeEventListener("focus", handleVisible);
  };
}
