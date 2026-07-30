import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { refreshCatalogCache } from "@/lib/catalog-cache";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
  type CustomerRow,
} from "@/lib/customers";
import { formatDate } from "@/lib/formatters";

type FormState = { name: string; phone: string; address: string; note: string };

const emptyForm: FormState = { name: "", phone: "", address: "", note: "" };

export function CustomersPage() {
  const { role } = useAuth();
  const isOwner = role === "OWNER";

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const result = await listCustomers();
    if (!result.success) {
      toast.error(result.message || "Gagal memuat");
      setRows([]);
    } else {
      setRows(result.data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.phone || "", r.address || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, searchQuery]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(row: CustomerRow) {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone || "",
      address: row.address || "",
      note: row.note || "",
    });
    setDialogOpen(true);
  }

  async function onSave() {
    setSubmitting(true);
    const result = editing
      ? await updateCustomer(editing.id, form)
      : await createCustomer(form);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.message || "Gagal menyimpan");
      return;
    }
    toast.success(result.message || "Berhasil");
    setDialogOpen(false);
    await refreshCatalogCache();
    await load();
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setSubmitting(true);
    const result = await deleteCustomer(deleteTarget.id);
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.message || "Gagal menghapus");
      return;
    }
    toast.success(result.message || "Dihapus");
    setDeleteTarget(null);
    await refreshCatalogCache();
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Pelanggan
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Data pelanggan untuk kasir
          </p>
        </div>
        <Button type="button" className="min-h-[44px] gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Tambah Pelanggan
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cari nama atau telepon..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : filtered.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">Belum Ada Pelanggan</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Tambah pelanggan agar bisa dipilih cepat di kasir.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((row) => (
              <Card key={row.id} className="shadow-sm">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{row.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.phone || "Tanpa telepon"}
                      </p>
                      {row.address && (
                        <p className="text-xs text-muted-foreground">
                          {row.address}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {isOwner && (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead>Dibuat</TableHead>
                  {isOwner && <TableHead className="w-[100px]">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">{row.name}</TableCell>
                    <TableCell>{row.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.address || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.created_at)}
                    </TableCell>
                    {isOwner && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Pelanggan" : "Tambah Pelanggan"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nama *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Telepon</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Alamat</label>
              <Textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Batal
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void onSave()}>
              {submitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pelanggan?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={() => void onDelete()}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
