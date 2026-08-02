import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Warehouse, Tags, Package, Boxes, ArrowLeftRight } from "lucide-react";

const items = [
  { href: "/gudang", label: "Lokasi", icon: Warehouse, exact: true },
  { href: "/gudang/kategori", label: "Kategori", icon: Tags, exact: false },
  { href: "/gudang/barang", label: "Barang", icon: Package, exact: false },
  { href: "/gudang/stok", label: "Stok", icon: Boxes, exact: false },
  { href: "/gudang/mutasi", label: "Mutasi", icon: ArrowLeftRight, exact: false },
];

export function GudangSubnav() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Inventori Gudang</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola barang dan stok</p>
      </div>

      <nav
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 rounded-2xl border border-border/80 bg-muted/50 p-1.5 dark:bg-muted/30"
        aria-label="Menu inventori"
      >
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  "group flex min-h-12 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                  isActive
                    ? "bg-background text-foreground font-semibold shadow-sm ring-1 ring-border dark:bg-card"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground dark:hover:bg-background/40"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/80 text-muted-foreground ring-1 ring-border/60 group-hover:text-foreground dark:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
