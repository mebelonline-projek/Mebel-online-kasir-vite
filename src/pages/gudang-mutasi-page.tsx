import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getInventoryBundle,
  type InventoryProductRow,
  type MovementRow,
  type StockRow,
  type WarehouseRow,
} from "@/lib/inventory";
import { MovementClient } from "@/components/inventory/movement-client";
import { PageListSkeleton } from "@/components/shared/page-skeleton";

export function GudangMutasiPage() {
  const [products, setProducts] = useState<InventoryProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getInventoryBundle();
    if (!result.success || !result.data) {
      setLoadError(result.message || "Gagal memuat mutasi");
      toast.error(result.message || "Gagal memuat mutasi");
      setProducts([]);
      setWarehouses([]);
      setStocks([]);
      setMovements([]);
    } else {
      setLoadError(null);
      setProducts(result.data.products);
      setWarehouses(result.data.warehouses);
      setStocks(result.data.stocks);
      setMovements(result.data.movements);
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
    <MovementClient
      products={products}
      warehouses={warehouses}
      stocks={stocks}
      movements={movements}
      loadError={loadError}
      onRefresh={load}
    />
  );
}
