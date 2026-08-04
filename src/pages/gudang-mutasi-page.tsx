import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  getInventoryBundle,
  getStockMovements,
  type InventoryProductRow,
  type MovementRow,
  type MovementTypeFilter,
  type StockRow,
  type WarehouseRow,
} from "@/lib/inventory";
import { MovementClient } from "@/components/inventory/movement-client";
import { PageListSkeleton } from "@/components/shared/page-skeleton";

const PAGE_LIMIT = 20;
const TYPE_VALUES = new Set<MovementTypeFilter>([
  "ALL",
  "IN",
  "OUT",
  "TRANSFER",
  "SALE",
  "VOID_RESTORE",
]);

function parseType(raw: string | null): MovementTypeFilter {
  if (raw && TYPE_VALUES.has(raw as MovementTypeFilter)) {
    return raw as MovementTypeFilter;
  }
  return "ALL";
}

export function GudangMutasiPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const typeFilter = parseType(searchParams.get("type"));
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const [products, setProducts] = useState<InventoryProductRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const syncUrl = useCallback(
    (next: { q?: string; type?: MovementTypeFilter; page?: number }) => {
      const params = new URLSearchParams();
      const nextQ = next.q !== undefined ? next.q : q;
      const nextType = next.type !== undefined ? next.type : typeFilter;
      const nextPage = next.page !== undefined ? next.page : page;
      if (nextQ) params.set("q", nextQ);
      if (nextType && nextType !== "ALL") params.set("type", nextType);
      if (nextPage > 1) params.set("page", String(nextPage));
      setSearchParams(params, { replace: true });
    },
    [q, typeFilter, page, setSearchParams]
  );

  const loadCatalog = useCallback(async () => {
    const result = await getInventoryBundle();
    if (!result.success || !result.data) {
      setLoadError(result.message || "Gagal memuat mutasi");
      toast.error(result.message || "Gagal memuat mutasi");
      setProducts([]);
      setWarehouses([]);
      setStocks([]);
      return false;
    }
    setLoadError(null);
    setProducts(result.data.products);
    setWarehouses(result.data.warehouses);
    setStocks(result.data.stocks);
    return true;
  }, []);

  const loadMovements = useCallback(async () => {
    setListLoading(true);
    const result = await getStockMovements({
      page,
      limit: PAGE_LIMIT,
      type: typeFilter,
      q,
    });
    setListLoading(false);
    if (!result.success || !result.data) {
      toast.error(result.message || "Gagal memuat riwayat");
      setMovements([]);
      setTotal(0);
      setTotalPages(1);
      return;
    }
    setMovements(result.data.movements);
    setTotal(result.data.total);
    setTotalPages(result.data.totalPages);
  }, [page, typeFilter, q]);

  const refreshAll = useCallback(async () => {
    await loadCatalog();
    await loadMovements();
  }, [loadCatalog, loadMovements]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      await loadCatalog();
      if (mounted) setLoading(false);
    }
    void init();
    return () => {
      mounted = false;
    };
  }, [loadCatalog]);

  useEffect(() => {
    if (loading) return;
    void loadMovements();
  }, [loading, loadMovements]);

  if (loading) {
    return <PageListSkeleton />;
  }

  return (
    <MovementClient
      products={products}
      warehouses={warehouses}
      stocks={stocks}
      movements={movements}
      total={total}
      totalPages={totalPages}
      page={page}
      searchQuery={q}
      typeFilter={typeFilter}
      loadError={loadError}
      listLoading={listLoading}
      onRefresh={refreshAll}
      onSearchChange={(next) => syncUrl({ q: next, page: 1 })}
      onTypeFilterChange={(next) => syncUrl({ type: next, page: 1 })}
      onPageChange={(next) => syncUrl({ page: next })}
    />
  );
}
