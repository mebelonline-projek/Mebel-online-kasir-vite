import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Wrench,
  Settings,
  Sun,
  Moon,
  FileText,
  Wallet,
  Users,
  Package,
  Warehouse,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreLogo } from "@/components/shared/store-logo";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import { useTheme } from "@/providers/theme-provider";
import { filterNavForRole, getDashboardHref } from "@/lib/nav";

export function AppSidebar() {
  const { profile, role, signOut } = useAuth();
  const store = useStore();
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const allNavItems = [
    {
      label: "Dashboard",
      href: getDashboardHref(role),
      icon: LayoutDashboard,
      hideForGudang: true,
    },
    { label: "Transaksi", href: "/transaksi", icon: Receipt, hideForGudang: true },
    { label: "Pelanggan", href: "/customer", icon: Users, hideForGudang: true },
    { label: "Produk", href: "/produk", icon: Package, hideForGudang: true },
    {
      label: "Gudang",
      href: "/gudang",
      icon: Warehouse,
      inventoryOnly: true,
    },
    { label: "Piutang", href: "/piutang", icon: Wallet, ownerOnly: true },
    { label: "Invoice", href: "/invoice", icon: FileText, hideForGudang: true },
    { label: "Biaya", href: "/operasional", icon: Wrench, hideForGudang: true },
    {
      label: "Setelan",
      href: "/pengaturan",
      icon: Settings,
      ownerOnly: true,
    },
  ];

  const navItems = filterNavForRole(allNavItems, role);
  const brandName = store.store_name || "Mebel Online";

  return (
    <aside className="fixed top-0 left-0 z-50 hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar py-6 lg:flex">
      <div className="mb-10 flex flex-col items-center px-6 text-center">
        <StoreLogo src={store.logo_url} alt={brandName} size="md" className="mb-3" />
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ color: "var(--sidebar-primary)" }}
        >
          {brandName}
        </h1>
        <p
          className="mt-1 text-[10px] tracking-widest uppercase"
          style={{ color: "var(--muted-foreground)" }}
        >
          Monitoring
        </p>
      </div>

      <nav className="flex-grow space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} to={item.href}>
              <div
                className={`group flex items-center gap-3 px-6 py-3 transition-all duration-300 ${
                  isActive
                    ? "border-r-4 border-primary bg-primary-container font-semibold text-on-primary-container"
                    : "text-muted-foreground hover:bg-accent hover:text-primary"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-3">
        {mounted && (
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-xs text-muted-foreground hover:text-primary"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-4 w-4" />
                Mode Terang
              </>
            ) : (
              <>
                <Moon className="h-4 w-4" />
                Mode Gelap
              </>
            )}
          </Button>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-sidebar-border/50 px-6 pt-6">
        <div className="flex items-center gap-3">
          <StoreLogo src={store.logo_url} alt={brandName} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-sidebar-foreground">
              {profile?.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {profile?.role === "OWNER"
                ? "Owner Profile"
                : profile?.role === "GUDANG"
                  ? "Petugas Gudang"
                  : profile?.role}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-xs text-muted-foreground hover:bg-transparent hover:text-destructive"
          type="button"
          onClick={() => void signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Keluar
        </Button>
      </div>
    </aside>
  );
}
