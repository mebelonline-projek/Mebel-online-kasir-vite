import { useState } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryRow,
} from "@/lib/inventory";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, Tags } from "lucide-react";

export function CategoryListClient({
  initialCategories,
  loadError,
  onRefresh,
}: {
  initialCategories: CategoryRow[];
  loadError?: string | null;
  onRefresh: () => void | Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDialogOpen(true);
  };

  const openEdit = (c: CategoryRow) => {
    setEditing(c);
    setName(c.name);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setBusy(true);
    const result = editing
      ? await updateCategory(editing.id, { name })
      : await createCategory({ name });
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
    const result = await deleteCategory(deleteTarget.id);
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
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">Kategori untuk mengelompokkan barang inventori.</p>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Tambah Kategori
        </Button>
      </div>

      {initialCategories.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="py-16 text-center">
            <Tags className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Belum ada kategori</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {initialCategories.map((c) => (
              <Card key={c.id} className="shadow-sm">
                <CardContent className="p-4 flex items-center justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(c)}
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
                  <TableHead className="w-[100px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialCategories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-semibold">{c.name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteTarget(c)}
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
            <DialogTitle>{editing ? "Edit Kategori" : "Tambah Kategori"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-sm font-medium">Nama</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Sofa" />
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
            <AlertDialogTitle>Hapus kategori?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} akan dihapus. Gagal jika masih dipakai barang.
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
