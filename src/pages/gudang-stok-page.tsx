import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getInventoryBundle,
  type CategoryRow,
  type InventoryProductRow,
  type StockRow,
  type WarehouseRow,
} from "@/lib/inventory";
import { StockMatrixClient } from "@/components/inventory/stock-matrix-client";
import { PageListSkeleton } from "@/components/shared/page-skeleton";

export function GudangStokPage() {
  const [products, setProducts] = useState<InventoryProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const result = await getInventoryBundle();
      if (!mounted) return;
      if (!result.success || !result.data) {
        setLoadError(result.message || "Gagal memuat stok");
        toast.error(result.message || "Gagal memuat stok");
      } else {
        setLoadError(null);
        setProducts(result.data.products);
        setCategories(result.data.categories);
        setWarehouses(result.data.warehouses);
        setStocks(result.data.stocks);
      }
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <PageListSkeleton />;
  }

  return (
    <StockMatrixClient
      products={products}
      warehouses={warehouses}
      categories={categories}
      stocks={stocks}
      loadError={loadError}
    />
  );
}
