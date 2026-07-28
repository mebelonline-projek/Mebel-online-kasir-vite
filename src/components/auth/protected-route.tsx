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
          Salin <code>.env.example</code> ke <code>.env.local</code> dan isi
          URL + anon key Supabase staging. Produksi Next tetap tidak disentuh.
        </p>
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
