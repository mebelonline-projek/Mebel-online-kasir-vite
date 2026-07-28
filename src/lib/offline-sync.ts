import { toast } from "sonner";
import type { PendingTransaction } from "@/lib/offline-db";
import { offlineDb } from "@/lib/offline-db";
import { createTransaction } from "@/lib/transactions";
import type { TransactionCreateValues } from "@/lib/validation";

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
      } catch (error) {
        await offlineDb.pendingTransactions.update(item.clientId, {
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Sync gagal",
        });
      }
    }

    if (synced > 0) {
      toast.success(`${synced} transaksi offline berhasil disinkronkan`);
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

  window.addEventListener("online", handleOnline);

  if (navigator.onLine) {
    void flushPendingTransactions();
  }

  return () => window.removeEventListener("online", handleOnline);
}
