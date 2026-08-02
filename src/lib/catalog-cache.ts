import {
  offlineDb,
  type CachedCustomer,
  type CachedProduct,
  type CachedStock,
  type CachedWarehouse,
} from "@/lib/offline-db";
import { supabase } from "@/lib/supabase";

export function getStockQty(
  stocks: CachedStock[],
  productId: string,
  warehouseId: string
): number {
  const row = stocks.find(
    (s) => s.product_id === productId && s.warehouse_id === warehouseId
  );
  return row?.qty ?? 0;
}

/** Cache pelanggan, produk, gudang, stok untuk kasir (online + offline). */
export async function refreshCatalogCache(): Promise<void> {
  if (!offlineDb || !navigator.onLine) return;

  const [customersRes, productsRes, warehousesRes, stocksRes] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone")
        .order("name")
        .limit(200),
      supabase
        .from("products")
        .select(
          "id, name, category, base_price, unit, parent_id, warna, ukuran, min_stock"
        )
        .order("name")
        .limit(500),
      supabase
        .from("warehouses")
        .select("id, name, is_active, is_sales_warehouse")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("warehouse_stocks")
        .select("warehouse_id, product_id, qty")
        .limit(2000),
    ]);

  const now = Date.now();

  if (customersRes.data) {
    const rows: CachedCustomer[] = customersRes.data.map((c) => ({
      id: c.id as string,
      name: c.name as string,
      phone: (c.phone as string | null) ?? null,
      cachedAt: now,
    }));
    await offlineDb.cachedCustomers.clear();
    if (rows.length) await offlineDb.cachedCustomers.bulkPut(rows);
  }

  if (productsRes.data) {
    const rows: CachedProduct[] = productsRes.data.map((p) => ({
      id: p.id as string,
      name: p.name as string,
      category: (p.category as string) || "-",
      base_price: Number(p.base_price),
      unit: (p.unit as string) || "pcs",
      parent_id: (p.parent_id as string | null) ?? null,
      warna: (p.warna as string | null) ?? null,
      ukuran: (p.ukuran as string | null) ?? null,
      min_stock: Number(p.min_stock) || 0,
      cachedAt: now,
    }));
    await offlineDb.cachedProducts.clear();
    if (rows.length) await offlineDb.cachedProducts.bulkPut(rows);
  }

  if (warehousesRes.data) {
    const rows: CachedWarehouse[] = warehousesRes.data.map((w) => ({
      id: w.id as string,
      name: w.name as string,
      is_active: Boolean(w.is_active),
      is_sales_warehouse: Boolean(w.is_sales_warehouse),
      cachedAt: now,
    }));
    await offlineDb.cachedWarehouses.clear();
    if (rows.length) await offlineDb.cachedWarehouses.bulkPut(rows);
  }

  if (stocksRes.data) {
    const rows: CachedStock[] = stocksRes.data.map((s) => ({
      id: `${s.warehouse_id as string}:${s.product_id as string}`,
      warehouse_id: s.warehouse_id as string,
      product_id: s.product_id as string,
      qty: Number(s.qty) || 0,
      cachedAt: now,
    }));
    await offlineDb.cachedStocks.clear();
    if (rows.length) await offlineDb.cachedStocks.bulkPut(rows);
  }
}

export async function getCachedCustomers(): Promise<CachedCustomer[]> {
  if (!offlineDb) return [];
  return offlineDb.cachedCustomers.orderBy("name").toArray();
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  if (!offlineDb) return [];
  return offlineDb.cachedProducts.orderBy("name").toArray();
}

export async function getCachedWarehouses(): Promise<CachedWarehouse[]> {
  if (!offlineDb) return [];
  return offlineDb.cachedWarehouses.orderBy("name").toArray();
}

export async function getCachedStocks(): Promise<CachedStock[]> {
  if (!offlineDb) return [];
  return offlineDb.cachedStocks.toArray();
}
