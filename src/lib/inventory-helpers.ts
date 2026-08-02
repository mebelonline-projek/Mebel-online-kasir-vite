/** Pure helpers for inventori UI. */

export type StockQtyRow = {
  warehouse_id: string;
  product_id: string;
  qty: number;
};

export function getStockQty(
  stocks: StockQtyRow[],
  productId: string,
  warehouseId: string
): number {
  return (
    stocks.find(
      (s) => s.product_id === productId && s.warehouse_id === warehouseId
    )?.qty ?? 0
  );
}

export function getTotalStock(stocks: StockQtyRow[], productId: string): number {
  return stocks
    .filter((s) => s.product_id === productId)
    .reduce((sum, s) => sum + s.qty, 0);
}

/** Label kasir/stok: "Nama — Warna / Ukuran" */
export function productDisplayName(p: {
  name: string;
  warna?: string | null;
  ukuran?: string | null;
}): string {
  const parts = [p.warna, p.ukuran].filter((x) => x && String(x).trim());
  if (parts.length === 0) return p.name;
  return `${p.name} — ${parts.join(" / ")}`;
}

export function isParentShellProduct(
  p: { id: string; parent_id?: string | null },
  all: { id: string; parent_id?: string | null }[]
): boolean {
  if (p.parent_id) return false;
  return all.some((c) => c.parent_id === p.id);
}

/**
 * Peringkat kecocokan pencarian barang: nama produk didahulukan, lalu varian,
 * baru kategori. Return -1 jika tidak cocok. Angka kecil = lebih relevan.
 */
export const NO_SEARCH_MATCH = -1;

export function productSearchScore(
  target: {
    name: string;
    parentName?: string;
    warna?: string | null;
    ukuran?: string | null;
    category?: string;
  },
  query: string
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const name = target.name.toLowerCase();
  const parentName = (target.parentName || "").toLowerCase();
  if (name.startsWith(q) || parentName.startsWith(q)) return 0;
  if (name.includes(q) || parentName.includes(q)) return 1;

  const variant = [target.warna, target.ukuran]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (variant.includes(q)) return 2;

  if ((target.category || "").toLowerCase().includes(q)) return 3;

  return NO_SEARCH_MATCH;
}

export function isSellableProduct(
  p: { id: string; parent_id?: string | null },
  all: { id: string; parent_id?: string | null }[]
): boolean {
  return !isParentShellProduct(p, all);
}
