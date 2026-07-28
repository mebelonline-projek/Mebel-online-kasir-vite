import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { useAuth } from "@/contexts/auth-context";
import type { NavItem } from "@/types/common";

const NAV: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", ownerOnly: true },
  { title: "Kasir", href: "/kasir", hideForGudang: true },
  { title: "Transaksi", href: "/transaksi", hideForGudang: true },
  { title: "Pelanggan", href: "/customer", hideForGudang: true },
  { title: "Produk", href: "/produk", hideForGudang: true },
];

function navForRole(role: string | null) {
  return NAV.filter((item) => {
    if (item.ownerOnly && role !== "OWNER") return false;
    if (item.hideForGudang && role === "GUDANG") return false;
    return true;
  });
}

function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { role } = useAuth();
  const items = navForRole(role);

  return (
    <nav className={className}>
      {items.map((item) => (
        <NavLink
          key={item.href}
          to={item.href}
          onClick={onNavigate}
          className={({ isActive }) =>
            `rounded-md px-3 py-2 text-sm ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`
          }
        >
          {item.title}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </Button>
            <Link to="/kasir" className="font-semibold tracking-tight">
              Mebel Monitor
            </Link>
            <NavLinks className="hidden items-center gap-2 md:flex" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {profile?.name} ({profile?.role})
            </span>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" />
              Keluar
            </Button>
          </div>
        </div>
        {open && (
          <div className="border-t border-border p-3 md:hidden">
            <NavLinks
              className="flex flex-col gap-1"
              onNavigate={() => setOpen(false)}
            />
          </div>
        )}
      </header>
      <OfflineBanner />
      <main className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
