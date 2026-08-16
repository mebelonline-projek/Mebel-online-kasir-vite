import Dexie, { type EntityTable } from "dexie";
import type { DashboardStats, PeriodType } from "@/lib/dashboard";
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
  category: string;
  base_price: number;
  cost_price: number;
  unit: string;
  parent_id: string | null;
  warna: string | null;
  ukuran: string | null;
  min_stock: number;
  cachedAt: number;
}

export interface CachedWarehouse {
  id: string;
  name: string;
  is_active: boolean;
  is_sales_warehouse: boolean;
  cachedAt: number;
}

export interface CachedStock {
  /** `${warehouseId}:${productId}` */
  id: string;
  warehouse_id: string;
  product_id: string;
  qty: number;
  cachedAt: number;
}

/** Snapshot list transaksi untuk paint instan (local-first). */
export interface CachedTransactionRow {
  id: string;
  transaction_number: string;
  customer_name: string | null;
  description: string | null;
  final_price: number;
  payment_type: "CASH" | "DP";
  dp_amount: number;
  status: string;
  fulfillment_status?: string | null;
  created_at: string;
  client_id?: string | null;
  offlinePending?: boolean;
  cachedAt: number;
}

export interface CachedDashboardRow {
  period: PeriodType;
  stats: DashboardStats;
  cachedAt: number;
}

/** Snapshot count kartu list transaksi (bukan window 50). */
export interface CachedTransactionListStats {
  id: "transaction-list-stats";
  total: number;
  lunas: number;
  menunggu: number;
  batal: number;
  cachedAt: number;
}

class OfflineDatabase extends Dexie {
  pendingTransactions!: EntityTable<PendingTransaction, "clientId">;
  cachedCustomers!: EntityTable<CachedCustomer, "id">;
  cachedProducts!: EntityTable<CachedProduct, "id">;
  cachedTransactions!: EntityTable<CachedTransactionRow, "id">;
  cachedWarehouses!: EntityTable<CachedWarehouse, "id">;
  cachedStocks!: EntityTable<CachedStock, "id">;
  cachedDashboard!: EntityTable<CachedDashboardRow, "period">;
  cachedTransactionListStats!: EntityTable<CachedTransactionListStats, "id">;

  constructor() {
    super("MebelMonitorSpaOffline");
    this.version(1).stores({
      pendingTransactions: "clientId, status, createdAt",
      cachedCustomers: "id, name, cachedAt",
      cachedProducts: "id, name, cachedAt",
    });
    this.version(2).stores({
      pendingTransactions: "clientId, status, createdAt",
      cachedCustomers: "id, name, cachedAt",
      cachedProducts: "id, name, cachedAt",
      cachedTransactions: "id, created_at, cachedAt, client_id",
    });
    this.version(3).stores({
      pendingTransactions: "clientId, status, createdAt",
      cachedCustomers: "id, name, cachedAt",
      cachedProducts: "id, name, cachedAt",
      cachedTransactions: "id, created_at, cachedAt, client_id",
      cachedWarehouses: "id, name, cachedAt",
      cachedStocks: "id, warehouse_id, product_id, cachedAt",
    });
    this.version(4).stores({
      pendingTransactions: "clientId, status, createdAt",
      cachedCustomers: "id, name, cachedAt",
      cachedProducts: "id, name, cachedAt",
      cachedTransactions: "id, created_at, cachedAt, client_id",
      cachedWarehouses: "id, name, cachedAt",
      cachedStocks: "id, warehouse_id, product_id, cachedAt",
      cachedDashboard: "period, cachedAt",
    });
    this.version(5).stores({
      pendingTransactions: "clientId, status, createdAt",
      cachedCustomers: "id, name, cachedAt",
      cachedProducts: "id, name, cachedAt",
      cachedTransactions: "id, created_at, cachedAt, client_id",
      cachedWarehouses: "id, name, cachedAt",
      cachedStocks: "id, warehouse_id, product_id, cachedAt",
      cachedDashboard: "period, cachedAt",
      cachedTransactionListStats: "id, cachedAt",
    });
  }
}

export const offlineDb =
  typeof window !== "undefined" ? new OfflineDatabase() : null;
