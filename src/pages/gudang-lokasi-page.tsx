import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getWarehouses, type WarehouseRow } from "@/lib/inventory";
import { WarehouseListClient } from "@/components/inventory/warehouse-list-client";
import { PageListSkeleton } from "@/components/shared/page-skeleton";

export function GudangLokasiPage() {
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getWarehouses();
    if (!result.success) {
      setLoadError(result.message || "Gagal memuat gudang");
      toast.error(result.message || "Gagal memuat gudang");
      setWarehouses([]);
    } else {
      setLoadError(null);
      setWarehouses(result.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <PageListSkeleton rows={4} />;
  }

  return (
    <WarehouseListClient
      initialWarehouses={warehouses}
      loadError={loadError}
      onRefresh={load}
    />
  );
}
