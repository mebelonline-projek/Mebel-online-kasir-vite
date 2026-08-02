import { useMemo, useState } from "react";
import {
  createStockMovement,
  type InventoryProductRow,
  type WarehouseRow,
  type StockRow,
  type MovementRow,
} from "@/lib/inventory";
import { getStockQty, isSellableProduct, productDisplayName } from "@/lib/inventory-helpers";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeftRight } from "lucide-react";

type FormMovementType = "IN" | "OUT" | "TRANSFER";

const FORM_TYPES: { value: FormMovementType; label: string }[] = [
  { value: "IN", label: "Masuk" },
  { value: "OUT", label: "Keluar" },
  { value: "TRANSFER", label: "Pindah" },
];

function movementTypeLabel(type: MovementRow["type"]): string {
  switch (type) {
    case "IN":
      return "Masuk";
    case "OUT":
      return "Keluar";
    case "TRANSFER":
      return "Pindah";
    case "SALE":
      return "Penjualan";
    case "VOID_RESTORE":
      return "Batal transaksi";
    default:
      return type;
  }
}

function movementBadgeVariant(
  type: MovementRow["type"]
): "secondary" | "outline" | "default" {
  if (type === "SALE") return "default";
  if (type === "VOID_RESTORE") return "outline";
  return "secondary";
}

function movementRouteLabel(
  m: MovementRow,
  warehouseName: (id: string | null) => string
): string {
  if (m.type === "IN" || m.type === "VOID_RESTORE") {
    return `→ ${warehouseName(m.to_warehouse_id)}`;
  }
  if (m.type === "OUT" || m.type === "SALE") {
    return `← ${warehouseName(m.from_warehouse_id)}`;
  }
  return `${warehouseName(m.from_warehouse_id)} → ${warehouseName(m.to_warehouse_id)}`;
}

export function MovementClient({
  products,
  warehouses,
  stocks,
  movements,
  loadError,
  onRefresh,
}: {
  products: InventoryProductRow[];
  warehouses: WarehouseRow[];
  stocks: StockRow[];
  movements: MovementRow[];
  loadError?: string | null;
  onRefresh: () => void | Promise<void>;
}) {
  const activeWarehouses = warehouses.filter((w) => w.is_active);
  const salesWh = activeWarehouses.find((w) => w.is_sales_warehouse);
  const sellableProducts = useMemo(
    () => products.filter((p) => isSellableProduct(p, products)),
    [products]
  );

  const [type, setType] = useState<FormMovementType>("IN");
  const [productId, setProductId] = useState(sellableProducts[0]?.id || "");
  const [fromId, setFromId] = useState(salesWh?.id || activeWarehouses[0]?.id || "");
  const [toId, setToId] = useState(
    activeWarehouses.find((w) => !w.is_sales_warehouse)?.id || activeWarehouses[0]?.id || ""
  );
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => {
    if (!productId || !fromId) return 0;
    if (type === "IN") return Infinity;
    return getStockQty(stocks, productId, fromId);
  }, [stocks, productId, fromId, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await createStockMovement({
      type,
      product_id: productId,
      qty: Number(qty) || 0,
      from_warehouse_id: type === "IN" ? null : fromId,
      to_warehouse_id: type === "OUT" ? null : toId,
      note,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(`Mutasi ${movementTypeLabel(type)} berhasil`);
    setQty("1");
    setNote("");
    await onRefresh();
  };

  const warehouseName = (id: string | null) =>
    id ? warehouses.find((w) => w.id === id)?.name || id : "—";

  const productName = (id: string | null) => {
    if (!id) return "—";
    const p = products.find((x) => x.id === id);
    return p ? productDisplayName(p) : id;
  };

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardContent className="p-4 md:p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Form Mutasi</h2>
            <p className="text-sm text-muted-foreground">
              Masuk = barang datang · Keluar = barang keluar · Pindah = antar gudang
            </p>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Tipe</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FormMovementType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {FORM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Barang</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {sellableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {productDisplayName(p)}
                  </option>
                ))}
              </select>
            </div>
            {(type === "OUT" || type === "TRANSFER") && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Dari gudang</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  {activeWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} (stok: {getStockQty(stocks, productId, w.id)})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Tersedia: {available === Infinity ? "—" : `${available} pcs`}
                </p>
              </div>
            )}
            {(type === "IN" || type === "TRANSFER") && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Ke gudang</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  {activeWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Qty (pcs)</label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Catatan (opsional)</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Alasan mutasi"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                className="gap-2"
                disabled={products.length === 0 || busy}
              >
                <ArrowLeftRight className="w-4 h-4" />
                Catat Mutasi
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold text-lg">Riwayat</h2>
        {movements.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada mutasi</p>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {movements.map((m) => (
                <Card key={m.id} className="shadow-sm">
                  <CardContent className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={movementBadgeVariant(m.type)}>
                        {movementTypeLabel(m.type)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(m.created_at)}
                      </span>
                    </div>
                    <p className="font-semibold">{productName(m.product_id)}</p>
                    <p className="text-sm text-muted-foreground">
                      {movementRouteLabel(m, warehouseName)}
                      {" · "}
                      {m.qty} pcs
                    </p>
                    {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="shadow-sm overflow-hidden hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Barang</TableHead>
                    <TableHead>Dari / Ke</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(m.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={movementBadgeVariant(m.type)}>
                        {movementTypeLabel(m.type)}
                      </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {productName(m.product_id)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {movementRouteLabel(m, warehouseName)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m.qty}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                        {m.note || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
