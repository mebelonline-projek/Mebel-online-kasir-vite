import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { SettingsClient } from "@/components/settings/settings-client";
import { PengaturanSkeleton } from "@/components/shared/page-skeleton";
import { getStoreSettings, type StoreSettings } from "@/lib/settings";

export function PengaturanPage() {
  const { role, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await getStoreSettings();
      if (!cancelled) {
        setSettings(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authLoading || loading) {
    return <PengaturanSkeleton />;
  }

  if (role !== "OWNER") {
    if (role === "GUDANG") return <Navigate to="/gudang/stok" replace />;
    return <Navigate to="/kasir" replace />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Pengaturan</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kelola informasi toko, logo, dan user
        </p>
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        <Link
          to="/pengaturan"
          className="border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
        >
          Informasi Toko
        </Link>
        <Link
          to="/pengaturan/user"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          Kelola User
        </Link>
      </div>

      <SettingsClient settings={settings} profileRole={role || "OWNER"} />
    </div>
  );
}
