import { useState } from "react";
import {
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
  type WarehouseRow,
} from "@/lib/inventory";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Warehouse } from "lucide-react";

type FormState = {
  name: string;
  address: string;
  is_active: boolean;
  is_sales_warehouse: boolean;
};

const emptyForm: FormState = {
  name: "",
  address: "",
  is_active: true,
  is_sales_warehouse: false,
};

export function WarehouseListClient({
  initialWarehouses,
  loadError,
  onRefresh,
}: {
  initialWarehouses: WarehouseRow[];
  loadError?: string | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (w: WarehouseRow) => {
    setEditing(w);
    setForm({
      name: w.name,
      address: w.address || "",
      is_active: w.is_active,
      is_sales_warehouse: w.is_sales_warehouse,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setBusy(true);
    const result = editing
      ? await updateWarehouse(editing.id, form)
      : await createWarehouse({
          name: form.name,
          address: form.address,
          is_sales_warehouse: form.is_sales_warehouse,
        });
    setBusy(false);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    setDialogOpen(false);
    await onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const result = await deleteWarehouse(deleteTarget.id);
    setBusy(false);
    setDeleteTarget(null);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
    await onRefresh();
  };

  if (loadError) {
    return (
      <p className="text-sm text-destructive">
        {loadError}. Pastikan SQL <code className="text-xs">supabase/migrate_inventory.sql</code> sudah
        dijalankan di Supabase.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Kelola lokasi gudang. Satu gudang wajib sebagai penjualan.
        </p>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Tambah Gudang
        </Button>
      </div>

      {initialWarehouses.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-16 text-center">
            <Warehouse className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Belum ada gudang</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {initialWarehouses.map((w) => (
              <Card key={w.id} className="shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{w.name}</p>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {w.is_sales_warehouse && <Badge>Penjualan</Badge>}
                      <Badge variant={w.is_active ? "secondary" : "outline"}>
                        {w.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{w.address || "—"}</p>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(w)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(w)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-sm overflow-hidden hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialWarehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-semibold">
                      <div className="flex items-center gap-2">
                        {w.name}
                        {w.is_sales_warehouse && <Badge className="text-[10px]">Penjualan</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{w.address || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={w.is_active ? "secondary" : "outline"}>
                        {w.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteTarget(w)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Gudang" : "Tambah Gudang"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nama</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Contoh: Gudang Utama"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Alamat (opsional)</label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Aktif
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_sales_warehouse}
                onChange={(e) => setForm((f) => ({ ...f, is_sales_warehouse: e.target.checked }))}
              />
              Jadikan gudang penjualan (kasir)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={busy}>
              {editing ? "Simpan" : "Tambah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus gudang?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} akan dihapus. Gudang penjualan atau yang masih berstok tidak bisa dihapus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
