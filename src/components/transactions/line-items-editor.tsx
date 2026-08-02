import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { getStockQty } from "@/lib/catalog-cache";
import { formatCurrency } from "@/lib/formatters";
import {
  isSellableProduct,
  productDisplayName,
} from "@/lib/inventory-helpers";
import type {
  CachedProduct,
  CachedStock,
  CachedWarehouse,
} from "@/lib/offline-db";

export interface LineItem {
  key: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: string;
  note: string;
  warehouse_id: string | null;
}

interface Props {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: CachedProduct[];
  warehouses?: CachedWarehouse[];
  stocks?: CachedStock[];
}

function newLine(): LineItem {
  return {
    key: crypto.randomUUID(),
    product_id: null,
    product_name: "",
    quantity: 1,
    unit_price: "",
    note: "",
    warehouse_id: null,
  };
}

export function createDefaultLineItems(): LineItem[] {
  return [newLine()];
}

export function lineItemsTotal(items: LineItem[]): number {
  return items.reduce(
    (sum, item) => sum + item.quantity * (Number(item.unit_price) || 0),
    0
  );
}

export function LineItemsEditor({
  items,
  onChange,
  products,
  warehouses = [],
  stocks = [],
}: Props) {
  const salesWh =
    warehouses.find((w) => w.is_sales_warehouse && w.is_active) || null;
  const activeWarehouses = warehouses.filter((w) => w.is_active);

  const productOptions = useMemo(() => {
    const sellable = products.filter((p) => isSellableProduct(p, products));
    return sellable.map((p) => ({
      id: p.id,
      label: productDisplayName(p),
      sublabel: `${p.category} — ${formatCurrency(p.base_price)}`,
      searchName: p.name,
      searchWarna: p.warna,
      searchUkuran: p.ukuran,
      searchCategory: p.category,
    }));
  }, [products]);

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    onChange(
      items.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  };

  const removeItem = (key: string) => {
    if (items.length <= 1) return;
    onChange(items.filter((item) => item.key !== key));
  };

  const resolveWarehouseForProduct = (
    productId: string,
    qty: number,
    currentWh: string | null
  ) => {
    if (!salesWh) return currentWh;
    const salesQty = getStockQty(stocks, productId, salesWh.id);
    if (salesQty >= qty) return salesWh.id;
    if (currentWh && getStockQty(stocks, productId, currentWh) >= qty) {
      return currentWh;
    }
    const alt = activeWarehouses.find(
      (w) =>
        w.id !== salesWh.id && getStockQty(stocks, productId, w.id) >= qty
    );
    return alt?.id || salesWh.id;
  };

  const total = lineItemsTotal(items);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Produk / Item</label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, newLine()])}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Tambah Baris
        </Button>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => {
          const salesQty =
            item.product_id && salesWh
              ? getStockQty(stocks, item.product_id, salesWh.id)
              : null;
          const needFallback =
            Boolean(item.product_id && salesWh) &&
            salesQty !== null &&
            salesQty < item.quantity;
          const selectedWhId = item.warehouse_id || salesWh?.id || null;
          const selectedQty =
            item.product_id && selectedWhId
              ? getStockQty(stocks, item.product_id, selectedWhId)
              : null;
          const insufficient =
            item.product_id &&
            selectedQty !== null &&
            selectedQty < item.quantity;

          return (
            <div
              key={item.key}
              className="space-y-3 rounded-lg border border-border bg-accent/20 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Item {index + 1}
                </span>
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => removeItem(item.key)}
                    aria-label="Hapus baris"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <SearchablePicker
                label="Produk"
                placeholder="Cari produk..."
                options={productOptions}
                value={item.product_id}
                onChange={(id, opt) => {
                  const product = products.find((p) => p.id === id);
                  const wh = id
                    ? resolveWarehouseForProduct(id, item.quantity, null)
                    : null;
                  updateItem(item.key, {
                    product_id: id,
                    product_name: opt?.label || item.product_name,
                    unit_price: product?.base_price
                      ? product.base_price.toString()
                      : item.unit_price,
                    warehouse_id: wh,
                  });
                }}
                manualValue={item.product_name}
                onManualChange={(v) =>
                  updateItem(item.key, {
                    product_name: v,
                    product_id: null,
                    warehouse_id: null,
                  })
                }
                manualPlaceholder="Atau ketik nama produk..."
              />

              {item.product_id && salesWh && (
                <p className="text-xs text-muted-foreground">
                  Stok {salesWh.name}:{" "}
                  <span
                    className={
                      salesQty !== null && salesQty < item.quantity
                        ? "font-medium text-destructive"
                        : ""
                    }
                  >
                    {salesQty ?? 0} pcs
                  </span>
                </p>
              )}

              {needFallback && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Stok gudang penjualan kurang — pilih gudang sumber
                  </label>
                  <select
                    value={selectedWhId || ""}
                    onChange={(e) =>
                      updateItem(item.key, {
                        warehouse_id: e.target.value || null,
                      })
                    }
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {activeWarehouses.map((w) => {
                      const q = item.product_id
                        ? getStockQty(stocks, item.product_id, w.id)
                        : 0;
                      return (
                        <option
                          key={w.id}
                          value={w.id}
                          disabled={q < item.quantity}
                        >
                          {w.name}
                          {w.is_sales_warehouse ? " (penjualan)" : ""} — {q} pcs
                          {q < item.quantity ? " (tidak cukup)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {insufficient && (
                <p className="text-xs text-destructive">
                  Stok di gudang dipilih tidak cukup untuk qty ini.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Qty</label>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={item.quantity}
                    onChange={(e) => {
                      const quantity = Math.max(1, Number(e.target.value) || 1);
                      const wh = item.product_id
                        ? resolveWarehouseForProduct(
                            item.product_id,
                            quantity,
                            item.warehouse_id
                          )
                        : item.warehouse_id;
                      updateItem(item.key, { quantity, warehouse_id: wh });
                    }}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Harga Satuan
                  </label>
                  <CurrencyInput
                    value={item.unit_price}
                    onChange={(val) =>
                      updateItem(item.key, { unit_price: val })
                    }
                    className="min-h-[44px]"
                  />
                </div>
              </div>

              <p className="text-right text-sm font-semibold">
                Subtotal:{" "}
                {formatCurrency(
                  item.quantity * (Number(item.unit_price) || 0)
                )}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm text-muted-foreground">Total semua item</span>
        <span className="text-xl font-bold">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
