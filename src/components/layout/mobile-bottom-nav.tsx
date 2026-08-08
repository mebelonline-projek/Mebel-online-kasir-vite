import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  Plus,
  Boxes,
  Package,
  ArrowLeftRight,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDashboardHref } from "@/lib/nav";
import { MobileNavMenu } from "@/components/layout/mobile-nav-menu";

export function MobileBottomNav({ role }: { role: string }) {
  const { pathname } = useLocation();

  if (role === "GUDANG") {
    const items = [
      { label: "Stok", href: "/gudang/stok", icon: Boxes },
      { label: "Barang", href: "/gudang/barang", icon: Package },
      { label: "Mutasi", href: "/gudang/mutasi", icon: ArrowLeftRight },
      { label: "Gudang", href: "/gudang", icon: Warehouse },
    ];

    return (
      <nav className="fixed right-0 bottom-0 left-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-1px_3px_rgba(0,0,0,0.08)] backdrop-blur-sm lg:hidden dark:shadow-[0_-1px_3px_rgba(0,0,0,0.4)]">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-end px-1">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/gudang"
                ? pathname === "/gudang"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex h-full min-h-[44px] flex-col items-center justify-center rounded-xl transition-colors",
                  isActive && "text-primary"
                )}
                style={
                  isActive
                    ? {
                        background:
                          "color-mix(in srgb, var(--primary) 12%, transparent)",
                      }
                    : undefined
                }
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "mt-0.5 text-[10px] font-medium",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
          <MobileNavMenu role={role} />
        </div>
      </nav>
    );
  }

  const dashboardHref = getDashboardHref(role);
  const primaryItems = [
    { label: "Home", href: dashboardHref, icon: LayoutDashboard },
    { label: "Transaksi", href: "/transaksi", icon: Receipt },
  ];
  const isKasirActive = pathname.startsWith("/kasir");

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-1px_3px_rgba(0,0,0,0.08)] backdrop-blur-sm lg:hidden dark:shadow-[0_-1px_3px_rgba(0,0,0,0.4)]">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-end px-1">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex h-full min-h-[44px] flex-col items-center justify-center rounded-xl transition-colors",
                isActive && "text-primary"
              )}
              style={
                isActive
                  ? {
                      background:
                        "color-mix(in srgb, var(--primary) 12%, transparent)",
                    }
                  : undefined
              }
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        <Link
          to="/kasir"
          className="flex flex-col items-center justify-end -mt-4 pb-0.5"
          aria-label="Kasir — transaksi baru"
        >
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95",
              isKasirActive
                ? "bg-primary ring-2 ring-primary/30"
                : "bg-primary hover:bg-primary/90"
            )}
          >
            <Plus
              className="h-7 w-7 text-primary-foreground"
              strokeWidth={2.5}
            />
          </div>
          <span
            className={cn(
              "mt-0.5 text-[10px] font-semibold",
              isKasirActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            Kasir
          </span>
        </Link>

        <Link
          to="/produk"
          className={cn(
            "flex h-full min-h-[44px] flex-col items-center justify-center rounded-xl transition-colors",
            (pathname.startsWith("/produk") ||
              pathname.startsWith("/gudang/barang")) &&
              "text-primary"
          )}
          style={
            pathname.startsWith("/produk") ||
            pathname.startsWith("/gudang/barang")
              ? {
                  background:
                    "color-mix(in srgb, var(--primary) 12%, transparent)",
                }
              : undefined
          }
        >
          <Package
            className={cn(
              "h-5 w-5",
              pathname.startsWith("/produk") ||
                pathname.startsWith("/gudang/barang")
                ? "text-primary"
                : "text-muted-foreground"
            )}
          />
          <span
            className={cn(
              "mt-0.5 text-[10px] font-medium",
              pathname.startsWith("/produk") ||
                pathname.startsWith("/gudang/barang")
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            Produk
          </span>
        </Link>

        <MobileNavMenu role={role} />
      </div>
    </nav>
  );
}
