import Dexie, { type EntityTable } from "dexie";
import type { TransactionCreateValues } from "@/lib/validation";

export interface PendingTransaction {
  clientId: string;
  payload: TransactionCreateValues;
  status: "pending" | "syncing" | "synced" | "failed";
  errorMessage?: string;
  createdAt: number;
}

export interface CachedCustomer {
  id: string;
  name: string;
  phone: string | null;
  cachedAt: number;
}

export interface CachedProduct {
  id: string;
  name: string;
  base_price: number;
  unit: string;
  cachedAt: number;
}

class OfflineDatabase extends Dexie {
  pendingTransactions!: EntityTable<PendingTransaction, "clientId">;
  cachedCustomers!: EntityTable<CachedCustomer, "id">;
  cachedProducts!: EntityTable<CachedProduct, "id">;

  constructor() {
    super("MebelMonitorSpaOffline");
    this.version(1).stores({
      pendingTransactions: "clientId, status, createdAt",
      cachedCustomers: "id, name, cachedAt",
      cachedProducts: "id, name, cachedAt",
    });
  }
}

export const offlineDb =
  typeof window !== "undefined" ? new OfflineDatabase() : null;
