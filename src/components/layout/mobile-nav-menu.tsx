import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Users,
  Package,
  Warehouse,
  Wallet,
  FileText,
  Wrench,
  Settings,
  Plus,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getDashboardHref } from "@/lib/nav";

export function MobileNavMenu({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const menuItems =
    role === "GUDANG"
      ? [{ label: "Gudang", href: "/gudang", icon: Warehouse }]
      : [
          { label: "Kasir", href: "/kasir", icon: Plus },
          {
            label: "Dashboard",
            href: getDashboardHref(role),
            icon: LayoutDashboard,
          },
          { label: "Transaksi", href: "/transaksi", icon: Receipt },
          { label: "Pelanggan", href: "/customer", icon: Users },
          { label: "Produk", href: "/produk", icon: Package },
          {
            label: "Gudang",
            href: "/gudang",
            icon: Warehouse,
            ownerOnly: true,
          },
          { label: "Piutang", href: "/piutang", icon: Wallet, ownerOnly: true },
          { label: "Invoice", href: "/invoice", icon: FileText },
          { label: "Biaya Operasional", href: "/operasional", icon: Wrench },
          {
            label: "Pengaturan",
            href: "/pengaturan",
            icon: Settings,
            ownerOnly: true,
          },
        ].filter(
          (item) =>
            !("ownerOnly" in item && item.ownerOnly) || role === "OWNER"
        );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-center rounded-xl transition-colors"
            aria-label="Menu navigasi"
          />
        }
      >
        <Menu className="h-5 w-5 text-muted-foreground" />
        <span className="mt-1 text-[10px] font-medium text-muted-foreground">
          Menu
        </span>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl pb-safe"
      >
        <SheetHeader className="pb-2 text-left">
          <SheetTitle>Navigasi</SheetTitle>
        </SheetHeader>
        <nav className="grid grid-cols-2 gap-2 px-4 pt-2 pb-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/gudang"
                ? pathname === "/gudang"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-[48px] items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                  isActive
                    ? "border-primary/30 bg-primary/10 font-semibold text-primary"
                    : "border-border bg-card hover:bg-accent"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
