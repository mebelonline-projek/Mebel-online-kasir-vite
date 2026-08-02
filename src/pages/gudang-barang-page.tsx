import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getInventoryBundle,
  type CategoryRow,
  type InventoryProductRow,
  type StockRow,
  type WarehouseRow,
} from "@/lib/inventory";
import { ProductInventoryClient } from "@/components/inventory/product-inventory-client";
import { PageListSkeleton } from "@/components/shared/page-skeleton";

export function GudangBarangPage() {
  const [products, setProducts] = useState<InventoryProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getInventoryBundle();
    if (!result.success || !result.data) {
      setLoadError(result.message || "Gagal memuat inventori");
      toast.error(result.message || "Gagal memuat inventori");
      setProducts([]);
      setCategories([]);
      setWarehouses([]);
      setStocks([]);
    } else {
      setLoadError(null);
      setProducts(result.data.products);
      setCategories(result.data.categories);
      setWarehouses(result.data.warehouses);
      setStocks(result.data.stocks);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <PageListSkeleton />;
  }

  return (
    <ProductInventoryClient
      initialProducts={products}
      initialCategories={categories}
      initialStocks={stocks}
      initialWarehouses={warehouses}
      loadError={loadError}
      onRefresh={load}
    />
  );
}
