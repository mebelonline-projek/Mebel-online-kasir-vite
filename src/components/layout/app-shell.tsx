import { Outlet } from "react-router-dom";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { useAuth } from "@/contexts/auth-context";
import { StoreProvider } from "@/contexts/store-context";

export function AppShell() {
  const { role } = useAuth();

  return (
    <StoreProvider>
      <div className="min-h-screen overflow-x-hidden bg-background">
        <OfflineBanner />
        <AppSidebar />
        <MobileHeader />
        <div className="min-w-0 pb-safe lg:ml-64 lg:pb-0">
          <main className="mx-auto w-full max-w-7xl p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
        <MobileBottomNav role={role || "KARYAWAN"} />
      </div>
    </StoreProvider>
  );
}
