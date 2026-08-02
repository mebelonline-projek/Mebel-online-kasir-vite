import { useMemo, useState } from "react";
import {
  type InventoryProductRow,
  type WarehouseRow,
  type CategoryRow,
  type StockRow,
} from "@/lib/inventory";
import {
  getStockQty,
  getTotalStock,
  productSearchScore,
  NO_SEARCH_MATCH,
} from "@/lib/inventory-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Boxes, Search, X } from "lucide-react";

type StockGroup = {
  key: string;
  title: string;
  categoryLabel: string;
  isGroup: boolean;
  rows: InventoryProductRow[];
};

function variantLabel(p: InventoryProductRow) {
  const parts = [p.warna, p.ukuran].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : null;
}

function displayName(p: InventoryProductRow) {
  const v = variantLabel(p);
  return v ? `${p.name} — ${v}` : p.name;
}

function isParentShell(p: InventoryProductRow, all: InventoryProductRow[]) {
  if (p.parent_id) return false;
  return all.some((c) => c.parent_id === p.id);
}

function buildGroups(products: InventoryProductRow[]): StockGroup[] {
  const childrenByParent = new Map<string, InventoryProductRow[]>();
  for (const p of products) {
    if (!p.parent_id) continue;
    const list = childrenByParent.get(p.parent_id) || [];
    list.push(p);
    childrenByParent.set(p.parent_id, list);
  }

  const groups: StockGroup[] = [];
  const seenChildIds = new Set<string>();

  for (const p of products) {
    if (p.parent_id) continue;
    const children = childrenByParent.get(p.id);
    if (children && children.length > 0) {
      for (const c of children) seenChildIds.add(c.id);
      groups.push({
        key: p.id,
        title: p.name,
        categoryLabel: "",
        isGroup: true,
        rows: children.slice().sort((a, b) => displayName(a).localeCompare(displayName(b), "id")),
      });
    } else {
      groups.push({
        key: p.id,
        title: p.name,
        categoryLabel: "",
        isGroup: false,
        rows: [p],
      });
    }
  }

  // Orphan variants (parent missing from list) — still show
  for (const p of products) {
    if (!p.parent_id || seenChildIds.has(p.id)) continue;
    groups.push({
      key: p.id,
      title: displayName(p),
      categoryLabel: "",
      isGroup: false,
      rows: [p],
    });
  }

  return groups;
}

export function StockMatrixClient({
  products,
  warehouses,
  categories,
  stocks,
  loadError,
}: {
  products: InventoryProductRow[];
  warehouses: WarehouseRow[];
  categories: CategoryRow[];
  stocks: StockRow[];
  loadError?: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const activeWarehouses = warehouses.filter((w) => w.is_active);

  const categoryName = (p: InventoryProductRow) =>
    categories.find((c) => c.id === p.category_id)?.name || p.category || "";

  const sellableProducts = useMemo(
    () => products.filter((p) => !isParentShell(p, products)),
    [products]
  );

  const search = useMemo(() => {
    const q = searchQuery.trim();
    const parentNameById = new Map(
      products.filter((p) => !p.parent_id).map((p) => [p.id, p.name])
    );

    const passesFilters = (p: InventoryProductRow) => {
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      if (lowStockOnly && !(getTotalStock(stocks, p.id) < p.min_stock)) return false;
      return true;
    };

    const scoreById = new Map<string, number>();
    const matched = sellableProducts.filter((p) => {
      if (!passesFilters(p)) return false;
      const score = productSearchScore(
        {
          name: p.name,
          parentName: p.parent_id ? parentNameById.get(p.parent_id) || "" : "",
          warna: p.warna,
          ukuran: p.ukuran,
          category: categoryName(p),
        },
        q
      );
      if (score === NO_SEARCH_MATCH) return false;
      scoreById.set(p.id, score);
      return true;
    });

    if (!q) return { rows: matched, scoreById };

    // Nama produk utama cocok → variannya ikut tampil
    const parentIds = new Set(
      matched.filter((p) => p.parent_id).map((p) => p.parent_id as string)
    );
    const rows = sellableProducts.filter((p) => {
      if (scoreById.has(p.id)) return true;
      if (!p.parent_id || !parentIds.has(p.parent_id)) return false;
      if (!passesFilters(p)) return false;
      const inherited = Math.min(
        ...matched
          .filter((m) => m.parent_id === p.parent_id)
          .map((m) => scoreById.get(m.id) ?? NO_SEARCH_MATCH)
      );
      scoreById.set(p.id, Number.isFinite(inherited) ? inherited : 3);
      return true;
    });

    return { rows, scoreById };
  }, [sellableProducts, products, categories, searchQuery, categoryFilter, lowStockOnly, stocks]);

  const filteredProducts = search.rows;

  const groups = useMemo(() => {
    // Include parent shells only for grouping labels when any child remains
    const byId = new Map(products.map((p) => [p.id, p]));
    const withParents = [...filteredProducts];
    for (const p of filteredProducts) {
      if (p.parent_id && byId.has(p.parent_id)) {
        const parent = byId.get(p.parent_id)!;
        if (!withParents.some((x) => x.id === parent.id)) withParents.push(parent);
      }
    }
    const built = buildGroups(withParents).map((g) => ({
      ...g,
      categoryLabel: categoryName(g.rows[0]),
    }));

    const groupScore = (g: StockGroup) => {
      const scores = g.rows
        .map((p) => search.scoreById.get(p.id))
        .filter((s): s is number => s !== undefined);
      return scores.length ? Math.min(...scores) : 3;
    };

    return built.sort((a, b) => {
      const diff = groupScore(a) - groupScore(b);
      if (diff !== 0) return diff;
      return a.title.localeCompare(b.title, "id");
    });
  }, [filteredProducts, products, categories, search]);

  const isFiltered =
    Boolean(searchQuery.trim()) || Boolean(categoryFilter) || lowStockOnly;

  const resetFilters = () => {
    setSearchQuery("");
    setCategoryFilter("");
    setLowStockOnly(false);
  };

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (products.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-16 text-center">
          <Boxes className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Belum ada data stok</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Matriks stok per gudang. Badge muncul jika total di bawah stok minimum.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, kategori, warna, ukuran..."
              className="pl-9 min-h-[44px] h-11"
              aria-label="Cari stok"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="flex min-h-[44px] h-11 w-full sm:w-48 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            aria-label="Filter kategori"
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant={lowStockOnly ? "default" : "outline"}
            className="min-h-[44px] sm:w-auto"
            onClick={() => setLowStockOnly((v) => !v)}
            aria-pressed={lowStockOnly}
          >
            Stok Menipis
          </Button>
          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-[44px] gap-1"
              onClick={resetFilters}
            >
              <X className="w-4 h-4" />
              Reset
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Menampilkan {filteredProducts.length} dari {sellableProducts.length} barang
        </p>
      </div>

      {filteredProducts.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-16 text-center">
            <Boxes className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {isFiltered ? "Tidak ada hasil untuk filter ini" : "Belum ada data stok"}
            </p>
            {isFiltered && (
              <Button type="button" variant="outline" className="mt-4" onClick={resetFilters}>
                Reset Filter
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {groups.map((group) => {
              if (!group.isGroup) {
                const p = group.rows[0];
                if (!p) return null;
                const total = getTotalStock(stocks, p.id);
                const low = total < p.min_stock;
                const cat = categoryName(p) || "—";
                return (
                  <Card key={group.key} className="shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{displayName(p)}</p>
                          <p className="text-xs text-muted-foreground">{cat}</p>
                        </div>
                        {low && (
                          <Badge
                            variant="outline"
                            className="text-destructive border-destructive/40 shrink-0"
                          >
                            Min {p.min_stock}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1">
                        {activeWarehouses.map((w) => (
                          <div key={w.id} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {w.name}
                              {w.is_sales_warehouse ? " ★" : ""}
                            </span>
                            <span className="font-medium">
                              {getStockQty(stocks, p.id, w.id)} pcs
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm border-t pt-1 font-semibold">
                          <span>Total</span>
                          <span className={low ? "text-destructive" : ""}>{total} pcs</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              const groupTotal = group.rows.reduce(
                (sum, p) => sum + getTotalStock(stocks, p.id),
                0
              );
              const anyLow = group.rows.some(
                (p) => getTotalStock(stocks, p.id) < p.min_stock
              );

              return (
                <Card key={group.key} className="shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{group.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.categoryLabel || "—"} · {group.rows.length} varian
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-semibold ${anyLow ? "text-destructive" : ""}`}>
                          {groupTotal} pcs
                        </p>
                        <p className="text-[11px] text-muted-foreground">Total</p>
                      </div>
                    </div>

                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {group.rows.map((p) => {
                        const total = getTotalStock(stocks, p.id);
                        const low = total < p.min_stock;
                        const v = variantLabel(p);
                        return (
                          <div key={p.id} className="bg-background p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                {v ? (
                                  v.split(" / ").map((part, i) => (
                                    <Badge
                                      key={`${p.id}-${part}-${i}`}
                                      variant={i === 0 ? "secondary" : "outline"}
                                    >
                                      {part}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm font-medium">{p.name}</span>
                                )}
                                {low && (
                                  <Badge
                                    variant="outline"
                                    className="text-destructive border-destructive/40"
                                  >
                                    Min {p.min_stock}
                                  </Badge>
                                )}
                              </div>
                              <span
                                className={`text-sm font-semibold tabular-nums shrink-0 ${
                                  low ? "text-destructive" : ""
                                }`}
                              >
                                {total} pcs
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              {activeWarehouses.map((w) => (
                                <div
                                  key={w.id}
                                  className="flex justify-between text-xs text-muted-foreground"
                                >
                                  <span>
                                    {w.name}
                                    {w.is_sales_warehouse ? " ★" : ""}
                                  </span>
                                  <span className="tabular-nums">
                                    {getStockQty(stocks, p.id, w.id)} pcs
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="shadow-sm overflow-x-auto hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barang</TableHead>
                  {activeWarehouses.map((w) => (
                    <TableHead key={w.id} className="text-right whitespace-nowrap">
                      {w.name}
                      {w.is_sales_warehouse ? " ★" : ""}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) =>
                  group.rows.map((p, idx) => {
                    const total = getTotalStock(stocks, p.id);
                    const low = total < p.min_stock;
                    const v = variantLabel(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-semibold whitespace-nowrap">
                          {group.isGroup ? (
                            <div className="space-y-0.5">
                              {idx === 0 && (
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  {group.title}
                                </p>
                              )}
                              <p className="pl-2">{v || displayName(p)}</p>
                            </div>
                          ) : (
                            displayName(p)
                          )}
                        </TableCell>
                        {activeWarehouses.map((w) => (
                          <TableCell key={w.id} className="text-right tabular-nums">
                            {getStockQty(stocks, p.id, w.id)}
                          </TableCell>
                        ))}
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${low ? "text-destructive" : ""}`}
                        >
                          {total}
                        </TableCell>
                        <TableCell>
                          {low ? (
                            <Badge
                              variant="outline"
                              className="text-destructive border-destructive/40"
                            >
                              Di bawah min ({p.min_stock})
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
