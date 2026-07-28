import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import type { UserRole } from "@/types/common";

export function ProtectedRoute({
  roles,
}: {
  roles?: UserRole[];
}) {
  const { user, profile, loading, configured } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <p className="p-8 text-center text-muted-foreground">Memuat...</p>
    );
  }

  if (!configured) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-8">
        <h1 className="text-lg font-semibold">Konfigurasi diperlukan</h1>
        <p className="text-sm text-muted-foreground">
          Variabel <code>VITE_SUPABASE_URL</code> dan{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> belum ada di build ini.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Lokal: salin <code>.env.example</code> → <code>.env.local</code>,
            lalu restart <code>npm run dev</code>.
          </li>
          <li>
            Cloudflare: Settings → Variables → tambah kedua key itu →{" "}
            <strong>Redeploy</strong> (Vite memasukkan env saat build).
          </li>
        </ul>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to="/kasir" replace />;
  }

  return <Outlet />;
}
