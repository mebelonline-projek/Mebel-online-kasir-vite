import { offlineDb, type CachedCustomer, type CachedProduct } from "@/lib/offline-db";
import { supabase } from "@/lib/supabase";

/** Cache pelanggan & produk untuk form kasir saat offline. */
export async function refreshCatalogCache(): Promise<void> {
  if (!offlineDb || !navigator.onLine) return;

  const [customersRes, productsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone")
      .order("name")
      .limit(200),
    supabase
      .from("products")
      .select("id, name, base_price, unit")
      .order("name")
      .limit(200),
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
      base_price: Number(p.base_price),
      unit: (p.unit as string) || "pcs",
      cachedAt: now,
    }));
    await offlineDb.cachedProducts.clear();
    if (rows.length) await offlineDb.cachedProducts.bulkPut(rows);
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
