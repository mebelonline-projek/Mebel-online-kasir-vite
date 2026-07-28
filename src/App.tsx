import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { LoginPage } from "@/pages/login-page";
import { RegisterPage } from "@/pages/register-page";
import { KasirPage } from "@/pages/kasir-page";
import { TransaksiListPage } from "@/pages/transaksi-list-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { PlaceholderPage } from "@/pages/placeholder-page";
import { setupOfflineSyncListeners } from "@/lib/offline-sync";

function OfflineBootstrap() {
  useEffect(() => {
    const cleanup = setupOfflineSyncListeners();
    void import("@/lib/catalog-cache").then(({ refreshCatalogCache }) => {
      if (navigator.onLine) void refreshCatalogCache();
    });
    const onOnline = () => {
      void import("@/lib/catalog-cache").then(({ refreshCatalogCache }) => {
        void refreshCatalogCache();
      });
    };
    window.addEventListener("online", onOnline);
    return () => {
      cleanup();
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return null;
}

function OwnerDashboard() {
  const { role } = useAuth();
  if (role !== "OWNER") return <Navigate to="/kasir" replace />;
  return <DashboardPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <OfflineBootstrap />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/kasir" replace />} />
              <Route path="/dashboard" element={<OwnerDashboard />} />
              <Route path="/kasir" element={<KasirPage />} />
              <Route path="/transaksi" element={<TransaksiListPage />} />
              <Route
                path="/customer"
                element={<PlaceholderPage title="Pelanggan" />}
              />
              <Route
                path="/produk"
                element={<PlaceholderPage title="Produk" />}
              />
              <Route
                path="/gudang"
                element={<PlaceholderPage title="Gudang" />}
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/kasir" replace />} />
        </Routes>
        <Toaster richColors position="top-center" />
      </BrowserRouter>
    </AuthProvider>
  );
}
