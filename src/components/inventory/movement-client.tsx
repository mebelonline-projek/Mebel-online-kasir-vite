import { useMemo, useState } from "react";
import {
  createStockMovement,
  deleteStockMovement,
  updateStockMovement,
  type InventoryProductRow,
  type WarehouseRow,
  type StockRow,
  type MovementRow,
  type MovementTypeFilter,
} from "@/lib/inventory";
import { getStockQty, isSellableProduct, productDisplayName } from "@/lib/inventory-helpers";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";

type FormMovementType = "IN" | "OUT" | "TRANSFER";

const FORM_TYPES: { value: FormMovementType; label: string }[] = [
  { value: "IN", label: "Masuk" },
  { value: "OUT", label: "Keluar" },
  { value: "TRANSFER", label: "Pindah" },
];

const FILTER_TYPES: { value: MovementTypeFilter; label: string }[] = [
  { value: "ALL", label: "Semua" },
  { value: "IN", label: "Masuk" },
  { value: "OUT", label: "Keluar" },
  { value: "TRANSFER", label: "Pindah" },
  { value: "SALE", label: "Penjualan" },
  { value: "VOID_RESTORE", label: "Batal" },
];

function isEditableMovement(type: MovementRow["type"]): type is FormMovementType {
  return type === "IN" || type === "OUT" || type === "TRANSFER";
}

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
  total,
  totalPages,
  page,
  searchQuery,
  typeFilter,
  loadError,
  listLoading,
  onRefresh,
  onSearchChange,
  onTypeFilterChange,
  onPageChange,
}: {
  products: InventoryProductRow[];
  warehouses: WarehouseRow[];
  stocks: StockRow[];
  movements: MovementRow[];
  total: number;
  totalPages: number;
  page: number;
  searchQuery: string;
  typeFilter: MovementTypeFilter;
  loadError?: string | null;
  listLoading?: boolean;
  onRefresh: () => void | Promise<void>;
  onSearchChange: (q: string) => void;
  onTypeFilterChange: (type: MovementTypeFilter) => void;
  onPageChange: (page: number) => void;
}) {
  const activeWarehouses = warehouses.filter((w) => w.is_active);
  const salesWh = activeWarehouses.find((w) => w.is_sales_warehouse);
  const sellableProducts = useMemo(
    () => products.filter((p) => isSellableProduct(p, products)),
    [products]
  );

  const productOptions = useMemo(
    () =>
      sellableProducts.map((p) => ({
        id: p.id,
        label: productDisplayName(p),
        sublabel: p.category || undefined,
        searchName: p.name,
        searchWarna: p.warna,
        searchUkuran: p.ukuran,
        searchCategory: p.category,
      })),
    [sellableProducts]
  );

  const [type, setType] = useState<FormMovementType>("IN");
  const [productId, setProductId] = useState("");
  const [fromId, setFromId] = useState(salesWh?.id || activeWarehouses[0]?.id || "");
  const [toId, setToId] = useState(
    activeWarehouses.find((w) => !w.is_sales_warehouse)?.id || activeWarehouses[0]?.id || ""
  );
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [deleteTarget, setDeleteTarget] = useState<MovementRow | null>(null);
  const [editTarget, setEditTarget] = useState<MovementRow | null>(null);
  const [editType, setEditType] = useState<FormMovementType>("IN");
  const [editProductId, setEditProductId] = useState("");
  const [editFromId, setEditFromId] = useState("");
  const [editToId, setEditToId] = useState("");
  const [editQty, setEditQty] = useState("1");
  const [editNote, setEditNote] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const available = useMemo(() => {
    if (!productId || !fromId) return 0;
    if (type === "IN") return Infinity;
    return getStockQty(stocks, productId, fromId);
  }, [stocks, productId, fromId, type]);

  const editAvailable = useMemo(() => {
    if (!editProductId || !editFromId) return 0;
    if (editType === "IN") return Infinity;
    return getStockQty(stocks, editProductId, editFromId);
  }, [stocks, editProductId, editFromId, editType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) {
      toast.error("Pilih barang dulu");
      return;
    }
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

  const openEdit = (m: MovementRow) => {
    if (!isEditableMovement(m.type)) return;
    setEditTarget(m);
    setEditType(m.type);
    setEditProductId(m.product_id || sellableProducts[0]?.id || "");
    setEditFromId(
      m.from_warehouse_id || salesWh?.id || activeWarehouses[0]?.id || ""
    );
    setEditToId(
      m.to_warehouse_id ||
        activeWarehouses.find((w) => !w.is_sales_warehouse)?.id ||
        activeWarehouses[0]?.id ||
        ""
    );
    setEditQty(String(m.qty));
    setEditNote(m.note || "");
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editProductId) {
      toast.error("Pilih barang dulu");
      return;
    }
    setEditBusy(true);
    const result = await updateStockMovement(editTarget.id, {
      type: editType,
      product_id: editProductId,
      qty: Number(editQty) || 0,
      from_warehouse_id: editType === "IN" ? null : editFromId,
      to_warehouse_id: editType === "OUT" ? null : editToId,
      note: editNote,
    });
    setEditBusy(false);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success("Riwayat mutasi diperbarui");
    setEditTarget(null);
    await onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const result = await deleteStockMovement(deleteTarget.id);
    setBusy(false);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success("Riwayat mutasi dihapus");
    setDeleteTarget(null);
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
            <div className="sm:col-span-2">
              <SearchablePicker
                label="Barang"
                placeholder="Cari nama / warna / ukuran…"
                options={productOptions}
                value={productId || null}
                onChange={(id) => setProductId(id || "")}
                allowManual={false}
              />
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-lg">Riwayat</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {total} mutasi
            {listLoading ? " · memuat…" : ""}
          </p>
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchChange(localSearch.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Cari nama barang atau catatan…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" size="sm">
              Cari
            </Button>
            {(searchQuery || typeFilter !== "ALL") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLocalSearch("");
                  onSearchChange("");
                  onTypeFilterChange("ALL");
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {FILTER_TYPES.map((t) => (
            <Button
              key={t.value}
              type="button"
              size="sm"
              variant={typeFilter === t.value ? "default" : "outline"}
              className="h-8"
              onClick={() => onTypeFilterChange(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {movements.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {searchQuery || typeFilter !== "ALL"
              ? "Tidak ada mutasi yang cocok"
              : "Belum ada mutasi"}
          </p>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {movements.map((m) => (
                <Card key={m.id} className="shadow-sm">
                  <CardContent className="p-4 space-y-2">
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
                    {m.note && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        {m.note}
                      </p>
                    )}
                    {isEditableMovement(m.type) && (
                      <div className="flex gap-1 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => openEdit(m)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(m)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Hapus
                        </Button>
                      </div>
                    )}
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
                    <TableHead className="w-[100px] text-right">Aksi</TableHead>
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
                      <TableCell className="text-right tabular-nums">
                        {m.qty}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground min-w-[12rem] max-w-md whitespace-pre-wrap break-words align-top">
                        {m.note || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditableMovement(m.type) ? (
                          <div className="flex justify-end gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(m)}
                              aria-label="Edit mutasi"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(m)}
                              aria-label="Hapus mutasi"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Halaman {page} dari {totalPages} ({total} mutasi)
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || listLoading}
                    onClick={() => onPageChange(page - 1)}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Sebelumnya
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || listLoading}
                    onClick={() => onPageChange(page + 1)}
                    className="gap-1"
                  >
                    Selanjutnya
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit mutasi</DialogTitle>
            <DialogDescription>
              Koreksi input salah. Stok digeser sesuai nilai baru. Waktu mutasi
              tetap.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2 py-1">
            <div className="space-y-1">
              <label className="text-sm font-medium">Tipe</label>
              <select
                value={editType}
                onChange={(e) =>
                  setEditType(e.target.value as FormMovementType)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {FORM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <SearchablePicker
                label="Barang"
                placeholder="Cari nama / warna / ukuran…"
                options={productOptions}
                value={editProductId || null}
                onChange={(id) => setEditProductId(id || "")}
                allowManual={false}
              />
            </div>
            {(editType === "OUT" || editType === "TRANSFER") && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Dari gudang</label>
                <select
                  value={editFromId}
                  onChange={(e) => setEditFromId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {activeWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} (stok:{" "}
                      {getStockQty(stocks, editProductId, w.id)})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Tersedia saat ini:{" "}
                  {editAvailable === Infinity ? "—" : `${editAvailable} pcs`}
                </p>
              </div>
            )}
            {(editType === "IN" || editType === "TRANSFER") && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Ke gudang</label>
                <select
                  value={editToId}
                  onChange={(e) => setEditToId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium">Catatan (opsional)</label>
              <Input
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Alasan koreksi"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={editBusy}
            >
              Batal
            </Button>
            <Button type="button" onClick={handleEditSave} disabled={editBusy}>
              {editBusy ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus mutasi?</AlertDialogTitle>
            <AlertDialogDescription>
              Hapus riwayat akan mengembalikan/mengoreksi stok sesuai mutasi
              ini
              {deleteTarget
                ? ` (${movementTypeLabel(deleteTarget.type)} · ${productName(deleteTarget.product_id)} · ${deleteTarget.qty} pcs)`
                : ""}
              . Lanjut?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
