import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  createCategory,
  createProduct,
  deleteProduct,
  listCategories,
  listProducts,
  updateProduct,
  type CategoryRow,
  type ProductRow,
} from "@/lib/products";

type FormState = {
  name: string;
  category_id: string;
  description: string;
  base_price: string;
};

const emptyForm: FormState = {
  name: "",
  category_id: "",
  description: "",
  base_price: "",
};

export function ProductsPage() {
  const { role } = useAuth();
  const canWrite = role === "OWNER" || role === "GUDANG";

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [newCategory, setNewCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const [productsRes, catsRes] = await Promise.all([
      listProducts(),
      listCategories(),
    ]);
    if (!productsRes.success) {
      toast.error(productsRes.message || "Gagal memuat produk");
      setRows([]);
    } else {
      setRows(productsRes.data || []);
    }
    if (catsRes.success) setCategories(catsRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.category, r.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, searchQuery]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      category_id: categories[0]?.id || "",
    });
    setNewCategory("");
    setDialogOpen(true);
  }

  function openEdit(row: ProductRow) {
    setEditing(row);
    setForm({
      name: row.name,
      category_id: row.category_id || "",
      description: row.description || "",
      base_price: String(row.base_price || ""),
    });
    setNewCategory("");
    setDialogOpen(true);
  }

  async function onAddCategory() {
    if (!newCategory.trim()) return;
    setSubmitting(true);
    const result = await createCategory({ name: newCategory.trim() });
    setSubmitting(false);
    if (!result.success || !result.data) {
      toast.error(result.message || "Gagal menambah kategori");
      return;
    }
    toast.success("Kategori ditambahkan");
    setNewCategory("");
    const cats = await listCategories();
    if (cats.success) setCategories(cats.data || []);
    setForm((f) => ({ ...f, category_id: result.data!.id }));
  }

  async function onSave() {
    setSubmitting(true);
    const payload = {
      name: form.name,
      category_id: form.category_id,
      description: form.description,
      base_price: Number(form.base_price) || 0,
    };
    const result = editing
      ? await updateProduct(editing.id, payload)
      : await createProduct(payload);
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
    const result = await deleteProduct(deleteTarget.id);
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
            Produk
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Katalog untuk kasir (stok isi via Mutasi / Gudang)
          </p>
        </div>
        {canWrite && (
          <Button
            type="button"
            className="min-h-[44px] gap-2"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" />
            Tambah Produk
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cari nama atau kategori..."
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
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">Belum Ada Produk</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Tambah produk agar bisa dipilih di kasir.
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
                        {row.category}
                      </p>
                      <p className="font-bold text-primary">
                        {formatCurrency(row.base_price)}
                      </p>
                    </div>
                    {canWrite && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {role === "OWNER" && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
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
                  <TableHead>Kategori</TableHead>
                  <TableHead>Harga</TableHead>
                  <TableHead>Dibuat</TableHead>
                  {canWrite && <TableHead className="w-[100px]">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold">{row.name}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(row.base_price)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.created_at)}
                    </TableCell>
                    {canWrite && (
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
                          {role === "OWNER" && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
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
              {editing ? "Edit Produk" : "Tambah Produk"}
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
              <label className="text-sm font-medium">Kategori *</label>
              <select
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={form.category_id}
                onChange={(e) =>
                  setForm({ ...form, category_id: e.target.value })
                }
              >
                <option value="">Pilih kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Input
                  placeholder="Kategori baru..."
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting || !newCategory.trim()}
                  onClick={() => void onAddCategory()}
                >
                  +
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Harga jual *</label>
              <CurrencyInput
                value={form.base_price}
                onChange={(v) => setForm({ ...form, base_price: v })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Deskripsi</label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
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
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void onSave()}
            >
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
            <AlertDialogTitle>Hapus produk?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} akan dihapus. Gagal jika masih ada stok.
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
