import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getCategories, type CategoryRow } from "@/lib/inventory";
import { CategoryListClient } from "@/components/inventory/category-list-client";
import { PageListSkeleton } from "@/components/shared/page-skeleton";

export function GudangKategoriPage() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getCategories();
    if (!result.success) {
      setLoadError(result.message || "Gagal memuat kategori");
      toast.error(result.message || "Gagal memuat kategori");
      setCategories([]);
    } else {
      setLoadError(null);
      setCategories(result.data || []);
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
    <CategoryListClient
      initialCategories={categories}
      loadError={loadError}
      onRefresh={load}
    />
  );
}
