import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { LoginPage } from "@/pages/login-page";
import { KasirPage } from "@/pages/kasir-page";
import { TransaksiListPage } from "@/pages/transaksi-list-page";
import { TransaksiDetailPage } from "@/pages/transaksi-detail-page";
import { TransaksiEditPage } from "@/pages/transaksi-edit-page";
import { PelunasanPage } from "@/pages/pelunasan-page";
import { NotaPage } from "@/pages/nota-page";
import { TransaksiHppPage } from "@/pages/transaksi-hpp-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { CustomersPage } from "@/pages/customers-page";
import { OperasionalPage } from "@/pages/operasional-page";
import { PiutangPage } from "@/pages/piutang-page";
import { InvoiceListPage } from "@/pages/invoice-list-page";
import { InvoiceBuatPage } from "@/pages/invoice-buat-page";
import { InvoiceDetailPage } from "@/pages/invoice-detail-page";
import { GudangLayout } from "@/pages/gudang-layout";
import { GudangLokasiPage } from "@/pages/gudang-lokasi-page";
import { GudangKategoriPage } from "@/pages/gudang-kategori-page";
import { GudangBarangPage } from "@/pages/gudang-barang-page";
import { GudangStokPage } from "@/pages/gudang-stok-page";
import { GudangMutasiPage } from "@/pages/gudang-mutasi-page";
import { PengaturanPage } from "@/pages/pengaturan-page";
import { PengaturanUserPage } from "@/pages/pengaturan-user-page";
import { setupOfflineSyncListeners } from "@/lib/offline-sync";
import { refreshCatalogCache } from "@/lib/catalog-cache";

function OfflineBootstrap() {
  useEffect(() => {
    const cleanup = setupOfflineSyncListeners();
    if (navigator.onLine) void refreshCatalogCache();
    const onOnline = () => {
      void refreshCatalogCache();
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
          <Route path="/register" element={<Navigate to="/login" replace />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/kasir" replace />} />
              <Route path="/dashboard" element={<OwnerDashboard />} />
              <Route path="/kasir" element={<KasirPage />} />
              <Route path="/transaksi" element={<TransaksiListPage />} />
              <Route path="/transaksi/:id" element={<TransaksiDetailPage />} />
              <Route
                path="/transaksi/:id/edit"
                element={<TransaksiEditPage />}
              />
              <Route
                path="/transaksi/:id/pelunasan"
                element={<PelunasanPage />}
              />
              <Route path="/transaksi/:id/nota" element={<NotaPage />} />
              <Route path="/transaksi/:id/hpp" element={<TransaksiHppPage />} />
              <Route path="/customer" element={<CustomersPage />} />
              <Route
                path="/produk"
                element={<Navigate to="/gudang/barang" replace />}
              />
              <Route path="/gudang" element={<GudangLayout />}>
                <Route index element={<GudangLokasiPage />} />
                <Route path="kategori" element={<GudangKategoriPage />} />
                <Route path="barang" element={<GudangBarangPage />} />
                <Route path="stok" element={<GudangStokPage />} />
                <Route path="mutasi" element={<GudangMutasiPage />} />
              </Route>
              <Route path="/piutang" element={<PiutangPage />} />
              <Route path="/invoice" element={<InvoiceListPage />} />
              <Route path="/invoice/buat" element={<InvoiceBuatPage />} />
              <Route path="/invoice/:id" element={<InvoiceDetailPage />} />
              <Route path="/operasional" element={<OperasionalPage />} />
              <Route path="/pengaturan" element={<PengaturanPage />} />
              <Route path="/pengaturan/user" element={<PengaturanUserPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/kasir" replace />} />
        </Routes>
        <Toaster richColors position="top-center" />
      </BrowserRouter>
    </AuthProvider>
  );
}
