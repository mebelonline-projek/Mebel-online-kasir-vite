import type { ActionState } from "@/types/common";
import { supabase } from "@/lib/supabase";
import { refreshCatalogCache } from "@/lib/catalog-cache";
import { processProductPhoto } from "@/lib/image-process";
import { fetchAllRows } from "@/lib/supabase-fetch-all";
import { dbId } from "@/lib/validation";
import { z } from "zod";

export type InventoryRole = "OWNER" | "KARYAWAN" | "GUDANG";

export type WarehouseRow = {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  is_sales_warehouse: boolean;
  created_at: string;
};

export type CategoryRow = {
  id: string;
  name: string;
  created_at: string;
};

export type InventoryProductRow = {
  id: string;
  name: string;
  category_id: string | null;
  category: string;
  base_price: number;
  unit: string;
  min_stock: number;
  photo_url: string | null;
  description: string | null;
  created_at: string;
  parent_id: string | null;
  warna: string | null;
  ukuran: string | null;
};

export type StockRow = {
  warehouse_id: string;
  product_id: string;
  qty: number;
};

export type MovementRow = {
  id: string;
  type: "IN" | "OUT" | "TRANSFER" | "SALE" | "VOID_RESTORE";
  product_id: string | null;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  qty: number;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

const warehouseSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(300).optional().or(z.literal("")),
  is_active: z.boolean().optional(),
  is_sales_warehouse: z.boolean().optional(),
});

const categorySchema = z.object({
  name: z.string().min(2).max(100),
});

const inventoryProductBaseSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter").max(200),
  category_id: z
    .string()
    .min(1, "Pilih kategori")
    .pipe(dbId("ID kategori tidak valid")),
  base_price: z.coerce.number().min(0).max(999_999_999),
  min_stock: z.coerce.number().int().min(0).max(999_999),
  description: z.string().max(500).optional().or(z.literal("")),
});

const variantRowSchema = z
  .object({
    warna: z.string().max(80).optional().or(z.literal("")),
    ukuran: z.string().max(80).optional().or(z.literal("")),
    base_price: z.coerce.number().min(0).max(999_999_999),
    min_stock: z.coerce.number().int().min(0).max(999_999).optional(),
    initial_qty: z.coerce.number().int().min(0).max(999_999).optional(),
  })
  .refine((v) => Boolean(v.warna?.trim()) || Boolean(v.ukuran?.trim()), {
    message: "Isi warna dan/atau ukuran untuk tiap varian",
  });

const inventoryProductCreateSchema = inventoryProductBaseSchema.extend({
  warehouse_id: dbId("ID gudang tidak valid")
    .optional()
    .nullable()
    .or(z.literal("")),
  initial_qty: z.coerce.number().int().min(0).max(999_999).optional(),
  variants: z.array(variantRowSchema).optional(),
});

const inventoryVariantUpdateSchema = z
  .object({
    warna: z.string().max(80).optional().or(z.literal("")),
    ukuran: z.string().max(80).optional().or(z.literal("")),
    base_price: z.coerce.number().min(0).max(999_999_999),
    min_stock: z.coerce.number().int().min(0).max(999_999),
  })
  .refine((v) => Boolean(v.warna?.trim()) || Boolean(v.ukuran?.trim()), {
    message: "Isi warna dan/atau ukuran",
  });

const inventoryVariantAddSchema = z
  .object({
    warna: z.string().max(80).optional().or(z.literal("")),
    ukuran: z.string().max(80).optional().or(z.literal("")),
    base_price: z.coerce.number().min(0).max(999_999_999),
    min_stock: z.coerce.number().int().min(0).max(999_999),
    warehouse_id: dbId("ID gudang tidak valid")
      .optional()
      .nullable()
      .or(z.literal("")),
    initial_qty: z.coerce.number().int().min(0).max(999_999).optional(),
  })
  .refine((v) => Boolean(v.warna?.trim()) || Boolean(v.ukuran?.trim()), {
    message: "Isi warna dan/atau ukuran",
  });

const movementSchema = z.object({
  type: z.enum(["IN", "OUT", "TRANSFER"]),
  product_id: dbId("Pilih barang"),
  qty: z.coerce.number().int().min(1).max(999_999),
  from_warehouse_id: dbId("Pilih gudang asal")
    .optional()
    .nullable()
    .or(z.literal("")),
  to_warehouse_id: dbId("Pilih gudang tujuan")
    .optional()
    .nullable()
    .or(z.literal("")),
  note: z.string().max(500).optional().or(z.literal("")),
});

export type WarehouseFormValues = z.infer<typeof warehouseSchema>;
export type CategoryFormValues = z.infer<typeof categorySchema>;
export type InventoryProductCreateValues = z.infer<
  typeof inventoryProductCreateSchema
>;
export type InventoryProductBaseValues = z.infer<
  typeof inventoryProductBaseSchema
>;
export type InventoryVariantAddValues = z.infer<typeof inventoryVariantAddSchema>;
export type InventoryVariantUpdateValues = z.infer<
  typeof inventoryVariantUpdateSchema
>;
export type MovementFormValues = z.infer<typeof movementSchema>;

async function requireInventoryWriter() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { ok: false as const, message: "Anda harus login" };
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || (profile.role !== "OWNER" && profile.role !== "GUDANG")) {
    return {
      ok: false as const,
      message: "Hanya Owner atau Gudang yang bisa mengubah inventori",
    };
  }
  return {
    ok: true as const,
    user,
    role: profile.role as InventoryRole,
  };
}

function variantKey(warna: string, ukuran: string) {
  return `${warna.trim().toLowerCase()}||${ukuran.trim().toLowerCase()}`;
}

async function initZeroStockForProduct(
  productId: string
): Promise<string | null> {
  const { data: whs } = await supabase
    .from("warehouses")
    .select("id")
    .eq("is_active", true);
  if (!whs?.length) return null;
  const { error } = await supabase.from("warehouse_stocks").insert(
    whs.map((w) => ({ warehouse_id: w.id, product_id: productId, qty: 0 }))
  );
  return error ? error.message : null;
}

async function afterInventoryWrite() {
  void refreshCatalogCache();
}

/** Mutasi stok via Edge (RPC service_role). */
export async function moveStock(params: {
  type: "IN" | "OUT" | "TRANSFER";
  productId: string;
  qty: number;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
}): Promise<ActionState> {
  const stockUrl = (
    import.meta.env.VITE_EDGE_APPLY_SALE_STOCK_URL as string | undefined
  )?.trim();
  if (!stockUrl) {
    return {
      success: false,
      message:
        "Mutasi stok belum aktif (set VITE_EDGE_APPLY_SALE_STOCK_URL + deploy Edge)",
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, message: "Anda harus login" };
  }

  const res = await fetch(stockUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action: "move",
      type: params.type,
      productId: params.productId,
      qty: params.qty,
      fromWarehouseId: params.fromWarehouseId ?? null,
      toWarehouseId: params.toWarehouseId ?? null,
      note: params.note ?? null,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    return {
      success: false,
      message: body.message || "Gagal mutasi stok",
    };
  }
  await afterInventoryWrite();
  return { success: true, message: `Mutasi ${params.type} berhasil` };
}

// ---------- READ ----------

export async function getWarehouses(): Promise<
  ActionState<WarehouseRow[]>
> {
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, address, is_active, is_sales_warehouse, created_at")
    .order("created_at", { ascending: true });
  if (error) return { success: false, message: error.message };
  return { success: true, data: (data || []) as WarehouseRow[] };
}

export async function getCategories(): Promise<ActionState<CategoryRow[]>> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name, created_at")
    .order("name");
  if (error) return { success: false, message: error.message };
  return { success: true, data: (data || []) as CategoryRow[] };
}

export async function getInventoryProducts(): Promise<
  ActionState<InventoryProductRow[]>
> {
  const { data, error } = await fetchAllRows(async (from, to) =>
    supabase
      .from("products")
      .select(
        "id, name, category_id, category, base_price, unit, min_stock, photo_url, description, created_at, parent_id, warna, ukuran"
      )
      .order("name")
      .order("id")
      .range(from, to)
  );
  if (error) return { success: false, message: error };
  return {
    success: true,
    data: data.map((p) => ({
      ...p,
      base_price: Number(p.base_price),
      unit: p.unit || "pcs",
      min_stock: p.min_stock ?? 0,
      parent_id: p.parent_id ?? null,
      warna: p.warna ?? null,
      ukuran: p.ukuran ?? null,
    })) as InventoryProductRow[],
  };
}

export async function getWarehouseStocks(): Promise<ActionState<StockRow[]>> {
  const { data, error } = await fetchAllRows(async (from, to) =>
    supabase
      .from("warehouse_stocks")
      .select("warehouse_id, product_id, qty")
      .order("warehouse_id")
      .order("product_id")
      .range(from, to)
  );
  if (error) return { success: false, message: error };
  return {
    success: true,
    data: data.map((s) => ({
      warehouse_id: s.warehouse_id,
      product_id: s.product_id,
      qty: Number(s.qty),
    })),
  };
}

export type MovementTypeFilter =
  | "ALL"
  | "IN"
  | "OUT"
  | "TRANSFER"
  | "SALE"
  | "VOID_RESTORE";

export type StockMovementsListResult = {
  movements: MovementRow[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
};

function sanitizeSearchTerm(q: string): string {
  return q.replace(/[%_,.()"'\\]/g, " ").trim().slice(0, 80);
}

export async function getStockMovements(
  params: {
    page?: number;
    limit?: number;
    type?: MovementTypeFilter;
    q?: string;
  } = {}
): Promise<ActionState<StockMovementsListResult>> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(50, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;
  const type = params.type ?? "ALL";
  const q = sanitizeSearchTerm(params.q || "");

  let productIds: string[] = [];
  if (q) {
    const pattern = `%${q}%`;
    const [byName, byWarna, byUkuran] = await Promise.all([
      supabase.from("products").select("id").ilike("name", pattern),
      supabase.from("products").select("id").ilike("warna", pattern),
      supabase.from("products").select("id").ilike("ukuran", pattern),
    ]);
    const set = new Set<string>();
    for (const res of [byName, byWarna, byUkuran]) {
      for (const row of res.data || []) set.add(row.id);
    }
    productIds = [...set];
  }

  let query = supabase
    .from("stock_movements")
    .select(
      "id, type, product_id, from_warehouse_id, to_warehouse_id, qty, note, created_at, created_by",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (type !== "ALL") {
    query = query.eq("type", type);
  }

  if (q) {
    const notePattern = `%${q}%`;
    if (productIds.length > 0) {
      const idList = productIds.slice(0, 100).join(",");
      query = query.or(`note.ilike."${notePattern}",product_id.in.(${idList})`);
    } else {
      query = query.ilike("note", notePattern);
    }
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return { success: false, message: error.message };

  const total = count || 0;
  return {
    success: true,
    data: {
      movements: (data || []) as MovementRow[],
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      page,
      limit,
    },
  };
}

export async function getInventoryBundle(): Promise<
  ActionState<{
    warehouses: WarehouseRow[];
    categories: CategoryRow[];
    products: InventoryProductRow[];
    stocks: StockRow[];
  }>
> {
  const [warehouses, categories, products, stocks] = await Promise.all([
    getWarehouses(),
    getCategories(),
    getInventoryProducts(),
    getWarehouseStocks(),
  ]);

  for (const r of [warehouses, categories, products, stocks]) {
    if (!r.success) {
      return { success: false, message: r.message || "Gagal memuat inventori" };
    }
  }

  return {
    success: true,
    data: {
      warehouses: warehouses.data!,
      categories: categories.data!,
      products: products.data!,
      stocks: stocks.data!,
    },
  };
}

// ---------- WAREHOUSE ----------

export async function createWarehouse(
  input: WarehouseFormValues
): Promise<ActionState<{ id: string }>> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = warehouseSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: "Validasi gagal" };

    const makeSales = Boolean(parsed.data.is_sales_warehouse);
    if (makeSales) {
      await supabase
        .from("warehouses")
        .update({ is_sales_warehouse: false })
        .eq("is_sales_warehouse", true);
    }

    const { data, error } = await supabase
      .from("warehouses")
      .insert({
        name: parsed.data.name.trim(),
        address: parsed.data.address?.trim() || null,
        is_active: true,
        is_sales_warehouse: makeSales,
      })
      .select("id")
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!data) return { success: false, message: "Gagal menambah gudang" };

    const { data: products } = await supabase
      .from("products")
      .select("id, parent_id");
    const parentIds = new Set(
      (products || [])
        .filter((p) => p.parent_id)
        .map((p) => p.parent_id as string)
    );
    const sellable = (products || []).filter((p) => !parentIds.has(p.id));
    if (sellable.length) {
      await supabase.from("warehouse_stocks").insert(
        sellable.map((p) => ({
          warehouse_id: data.id,
          product_id: p.id,
          qty: 0,
        }))
      );
    }

    await afterInventoryWrite();
    return {
      success: true,
      data: { id: data.id },
      message: "Gudang ditambahkan",
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function updateWarehouse(
  id: string,
  input: WarehouseFormValues
): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = warehouseSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: "Validasi gagal" };

    const isActive = parsed.data.is_active ?? true;
    const makeSales = Boolean(parsed.data.is_sales_warehouse);

    if (!isActive && makeSales) {
      return {
        success: false,
        message:
          "Gudang penjualan harus tetap aktif. Tandai gudang lain dulu.",
      };
    }

    if (makeSales) {
      await supabase
        .from("warehouses")
        .update({ is_sales_warehouse: false })
        .neq("id", id);
    }

    const { error } = await supabase
      .from("warehouses")
      .update({
        name: parsed.data.name.trim(),
        address: parsed.data.address?.trim() || null,
        is_active: isActive,
        is_sales_warehouse: makeSales,
      })
      .eq("id", id);

    if (error) return { success: false, message: error.message };
    await afterInventoryWrite();
    return { success: true, message: "Gudang diperbarui" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function deleteWarehouse(id: string): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };

    const { data: wh } = await supabase
      .from("warehouses")
      .select("is_sales_warehouse")
      .eq("id", id)
      .maybeSingle();

    if (!wh) return { success: false, message: "Gudang tidak ditemukan" };
    if (wh.is_sales_warehouse) {
      return {
        success: false,
        message: "Tidak bisa hapus gudang penjualan. Tandai gudang lain dulu.",
      };
    }

    const { data: stocks } = await supabase
      .from("warehouse_stocks")
      .select("qty")
      .eq("warehouse_id", id);

    if (stocks?.some((s) => Number(s.qty) > 0)) {
      return {
        success: false,
        message: "Gudang masih punya stok. Kosongkan dulu lewat mutasi.",
      };
    }

    const { error } = await supabase.from("warehouses").delete().eq("id", id);
    if (error) return { success: false, message: error.message };
    await afterInventoryWrite();
    return { success: true, message: "Gudang dihapus" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

// ---------- CATEGORY ----------

export async function createCategory(
  input: CategoryFormValues
): Promise<ActionState<{ id: string }>> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return { success: false, message: "Validasi gagal" };

    const { data, error } = await supabase
      .from("product_categories")
      .insert({ name: parsed.data.name.trim() })
      .select("id")
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!data) return { success: false, message: "Gagal menambah kategori" };
    await afterInventoryWrite();
    return {
      success: true,
      data: { id: data.id },
      message: "Kategori ditambahkan",
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function updateCategory(
  id: string,
  input: CategoryFormValues
): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return { success: false, message: "Validasi gagal" };

    const name = parsed.data.name.trim();
    const { error } = await supabase
      .from("product_categories")
      .update({ name })
      .eq("id", id);
    if (error) return { success: false, message: error.message };

    await supabase.from("products").update({ category: name }).eq("category_id", id);
    await afterInventoryWrite();
    return { success: true, message: "Kategori diperbarui" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function deleteCategory(id: string): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };

    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);

    if ((count || 0) > 0) {
      return {
        success: false,
        message: "Kategori masih dipakai barang. Pindahkan barang dulu.",
      };
    }

    const { error } = await supabase
      .from("product_categories")
      .delete()
      .eq("id", id);
    if (error) return { success: false, message: error.message };
    await afterInventoryWrite();
    return { success: true, message: "Kategori dihapus" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

// ---------- PRODUCT ----------

export async function createInventoryProduct(
  input: InventoryProductCreateValues
): Promise<ActionState<{ id: string }>> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = inventoryProductCreateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }

    const variants = parsed.data.variants || [];
    const hasVariants = variants.length > 0;

    if (hasVariants) {
      const keys = variants.map((v) =>
        variantKey(v.warna?.trim() || "", v.ukuran?.trim() || "")
      );
      if (new Set(keys).size !== keys.length) {
        return {
          success: false,
          message: "Ada varian duplikat (warna + ukuran sama)",
        };
      }
    }

    const initialQty = parsed.data.initial_qty ?? 0;
    const warehouseId = parsed.data.warehouse_id || null;
    const variantStockTotal = variants.reduce(
      (s, v) => s + (v.initial_qty ?? 0),
      0
    );
    if (!warehouseId && (hasVariants ? variantStockTotal > 0 : initialQty > 0)) {
      return { success: false, message: "Pilih gudang untuk stok awal" };
    }

    const { data: cat } = await supabase
      .from("product_categories")
      .select("name")
      .eq("id", parsed.data.category_id)
      .maybeSingle();

    if (!cat) {
      return {
        success: false,
        message: "Kategori tidak ditemukan. Buat kategori dulu di menu Kategori.",
      };
    }

    const name = parsed.data.name.trim();

    if (hasVariants) {
      const { data: parent, error: parentErr } = await supabase
        .from("products")
        .insert({
          name,
          category_id: parsed.data.category_id,
          category: cat.name || "LAINNYA",
          base_price: parsed.data.base_price,
          unit: "pcs",
          min_stock: parsed.data.min_stock,
          description: parsed.data.description?.trim() || null,
          parent_id: null,
          warna: null,
          ukuran: null,
          created_by: auth.user.id,
        })
        .select("id")
        .maybeSingle();

      if (parentErr) return { success: false, message: parentErr.message };
      if (!parent) return { success: false, message: "Gagal menambah produk" };

      for (const v of variants) {
        const { data: child, error: childErr } = await supabase
          .from("products")
          .insert({
            name,
            category_id: parsed.data.category_id,
            category: cat.name || "LAINNYA",
            base_price: v.base_price,
            unit: "pcs",
            min_stock: v.min_stock ?? parsed.data.min_stock,
            description: parsed.data.description?.trim() || null,
            parent_id: parent.id,
            warna: v.warna?.trim() || null,
            ukuran: v.ukuran?.trim() || null,
            created_by: auth.user.id,
          })
          .select("id")
          .maybeSingle();

        if (childErr || !child) {
          await supabase.from("products").delete().eq("id", parent.id);
          return {
            success: false,
            message: childErr?.message || "Gagal menambah varian",
          };
        }

        const stockErr = await initZeroStockForProduct(child.id);
        if (stockErr) {
          await supabase.from("products").delete().eq("id", parent.id);
          return {
            success: false,
            message: `Varian dibuat, tapi gagal inisialisasi stok: ${stockErr}`,
          };
        }

        const vQty = v.initial_qty ?? 0;
        if (vQty > 0 && warehouseId) {
          const move = await moveStock({
            type: "IN",
            productId: child.id,
            qty: vQty,
            toWarehouseId: warehouseId,
            note: "Stok awal saat tambah varian",
            referenceType: "PRODUCT",
            referenceId: child.id,
          });
          if (!move.success) {
            await supabase.from("products").delete().eq("id", parent.id);
            return {
              success: false,
              message: `Varian dibuat, tapi stok awal gagal: ${move.message}`,
            };
          }
        }
      }

      await afterInventoryWrite();
      const stockNote =
        variantStockTotal > 0
          ? ` (+${variantStockTotal} pcs stok awal)`
          : " (stok 0 — isi via Mutasi IN)";
      return {
        success: true,
        data: { id: parent.id },
        message: `Produk ditambahkan dengan ${variants.length} varian${stockNote}`,
      };
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        name,
        category_id: parsed.data.category_id,
        category: cat.name || "LAINNYA",
        base_price: parsed.data.base_price,
        unit: "pcs",
        min_stock: parsed.data.min_stock,
        description: parsed.data.description?.trim() || null,
        parent_id: null,
        warna: null,
        ukuran: null,
        created_by: auth.user.id,
      })
      .select("id")
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!data) return { success: false, message: "Gagal menambah barang" };

    const stockErr = await initZeroStockForProduct(data.id);
    if (stockErr) {
      return {
        success: false,
        message: `Barang dibuat, tapi gagal inisialisasi stok: ${stockErr}`,
      };
    }

    if (initialQty > 0 && warehouseId) {
      const move = await moveStock({
        type: "IN",
        productId: data.id,
        qty: initialQty,
        toWarehouseId: warehouseId,
        note: "Stok awal saat tambah barang",
        referenceType: "PRODUCT",
        referenceId: data.id,
      });
      if (!move.success) {
        return {
          success: false,
          message: `Barang dibuat, tapi stok awal gagal: ${move.message}. Isi via Mutasi IN.`,
        };
      }
    }

    await afterInventoryWrite();
    return {
      success: true,
      data: { id: data.id },
      message:
        initialQty > 0
          ? `Barang ditambahkan (+${initialQty} pcs stok awal)`
          : "Barang ditambahkan (stok 0 — isi via Mutasi IN)",
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function updateInventoryProduct(
  id: string,
  input: InventoryProductBaseValues
): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = inventoryProductBaseSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: "Validasi gagal" };

    const { data: existing } = await supabase
      .from("products")
      .select("id, parent_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return { success: false, message: "Barang tidak ditemukan" };
    if (existing.parent_id) {
      return {
        success: false,
        message: "Ini varian — edit warna/ukuran/harga lewat Edit Varian",
      };
    }

    const { data: cat } = await supabase
      .from("product_categories")
      .select("name")
      .eq("id", parsed.data.category_id)
      .maybeSingle();

    const name = parsed.data.name.trim();
    const { error } = await supabase
      .from("products")
      .update({
        name,
        category_id: parsed.data.category_id,
        category: cat?.name || "LAINNYA",
        base_price: parsed.data.base_price,
        min_stock: parsed.data.min_stock,
        description: parsed.data.description?.trim() || null,
      })
      .eq("id", id);

    if (error) return { success: false, message: error.message };

    await supabase
      .from("products")
      .update({
        name,
        category_id: parsed.data.category_id,
        category: cat?.name || "LAINNYA",
        description: parsed.data.description?.trim() || null,
      })
      .eq("parent_id", id);

    await afterInventoryWrite();
    return { success: true, message: "Barang diperbarui" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function addInventoryVariant(
  parentId: string,
  input: InventoryVariantAddValues
): Promise<ActionState<{ id: string }>> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = inventoryVariantAddSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }

    const { data: parent } = await supabase
      .from("products")
      .select(
        "id, name, category_id, category, description, parent_id, min_stock"
      )
      .eq("id", parentId)
      .maybeSingle();

    if (!parent) return { success: false, message: "Produk tidak ditemukan" };
    if (parent.parent_id) {
      return {
        success: false,
        message: "Tidak bisa menambah varian ke dalam varian",
      };
    }

    const { data: existingChildren } = await supabase
      .from("products")
      .select("id")
      .eq("parent_id", parentId);
    const convertingStandalone = !existingChildren?.length;

    if (convertingStandalone) {
      const { data: parentStocks } = await supabase
        .from("warehouse_stocks")
        .select("qty")
        .eq("product_id", parentId);
      if (parentStocks?.some((s) => Number(s.qty) > 0)) {
        return {
          success: false,
          message:
            "Produk masih punya stok. Mutasi OUT sampai 0 dulu sebelum menambah varian, atau buat produk baru.",
        };
      }
    }

    const warna = parsed.data.warna?.trim() || "";
    const ukuran = parsed.data.ukuran?.trim() || "";
    const { data: siblings } = await supabase
      .from("products")
      .select("warna, ukuran")
      .eq("parent_id", parentId);

    const key = variantKey(warna, ukuran);
    if (
      (siblings || []).some(
        (s) => variantKey(s.warna || "", s.ukuran || "") === key
      )
    ) {
      return {
        success: false,
        message: "Varian dengan warna/ukuran ini sudah ada",
      };
    }

    const initialQty = parsed.data.initial_qty ?? 0;
    const warehouseId = parsed.data.warehouse_id || null;
    if (initialQty > 0 && !warehouseId) {
      return { success: false, message: "Pilih gudang untuk stok awal" };
    }

    const { data: child, error } = await supabase
      .from("products")
      .insert({
        name: parent.name,
        category_id: parent.category_id,
        category: parent.category || "LAINNYA",
        base_price: parsed.data.base_price,
        unit: "pcs",
        min_stock: parsed.data.min_stock,
        description: parent.description,
        parent_id: parentId,
        warna: warna || null,
        ukuran: ukuran || null,
        created_by: auth.user.id,
      })
      .select("id")
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!child) return { success: false, message: "Gagal menambah varian" };

    if (convertingStandalone) {
      await supabase.from("warehouse_stocks").delete().eq("product_id", parentId);
    }

    const stockErr = await initZeroStockForProduct(child.id);
    if (stockErr) {
      await supabase.from("products").delete().eq("id", child.id);
      return { success: false, message: `Gagal inisialisasi stok: ${stockErr}` };
    }

    if (initialQty > 0 && warehouseId) {
      const move = await moveStock({
        type: "IN",
        productId: child.id,
        qty: initialQty,
        toWarehouseId: warehouseId,
        note: "Stok awal saat tambah varian",
        referenceType: "PRODUCT",
        referenceId: child.id,
      });
      if (!move.success) {
        await supabase.from("products").delete().eq("id", child.id);
        return {
          success: false,
          message: `Varian dibuat, tapi stok awal gagal: ${move.message}`,
        };
      }
    }

    await afterInventoryWrite();
    return {
      success: true,
      data: { id: child.id },
      message:
        initialQty > 0
          ? `Varian ditambahkan (+${initialQty} pcs stok awal)`
          : "Varian ditambahkan",
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function updateInventoryVariant(
  id: string,
  input: InventoryVariantUpdateValues
): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = inventoryVariantUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }

    const { data: existing } = await supabase
      .from("products")
      .select("id, parent_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return { success: false, message: "Varian tidak ditemukan" };
    if (!existing.parent_id) {
      return { success: false, message: "Ini bukan varian" };
    }

    const warna = parsed.data.warna?.trim() || "";
    const ukuran = parsed.data.ukuran?.trim() || "";
    const { data: siblings } = await supabase
      .from("products")
      .select("id, warna, ukuran")
      .eq("parent_id", existing.parent_id);

    const key = variantKey(warna, ukuran);
    if (
      (siblings || []).some(
        (s) =>
          s.id !== id && variantKey(s.warna || "", s.ukuran || "") === key
      )
    ) {
      return {
        success: false,
        message: "Varian dengan warna/ukuran ini sudah ada",
      };
    }

    const { error } = await supabase
      .from("products")
      .update({
        warna: warna || null,
        ukuran: ukuran || null,
        base_price: parsed.data.base_price,
        min_stock: parsed.data.min_stock,
      })
      .eq("id", id);

    if (error) return { success: false, message: error.message };
    await afterInventoryWrite();
    return { success: true, message: "Varian diperbarui" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function uploadProductPhoto(
  productId: string,
  file: File
): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return { success: false, message: "Format harus JPEG, PNG, atau WebP" };
    }

    const { data: product } = await supabase
      .from("products")
      .select("photo_url")
      .eq("id", productId)
      .maybeSingle();

    if (!product) return { success: false, message: "Barang tidak ditemukan" };

    let webp: File;
    try {
      webp = await processProductPhoto(file);
    } catch (err) {
      return {
        success: false,
        message: `Gagal kompres foto: ${err instanceof Error ? err.message : "error"}`,
      };
    }

    if (webp.size > 4 * 1024 * 1024) {
      return {
        success: false,
        message: `Foto terlalu besar (${Math.round(webp.size / 1024 / 1024)}MB) setelah kompres`,
      };
    }

    const path =
      webp.type === "image/webp" ? `${productId}.webp` : `${productId}.jpg`;
    if (product.photo_url?.includes("/product-photos/")) {
      const oldPath = product.photo_url.split("/product-photos/")[1]?.split("?")[0];
      if (oldPath) await supabase.storage.from("product-photos").remove([oldPath]);
    }

    const { error: upErr } = await supabase.storage
      .from("product-photos")
      .upload(path, webp, {
        contentType: webp.type || "image/webp",
        upsert: true,
      });
    if (upErr) return { success: false, message: upErr.message };

    const { data: pub } = supabase.storage
      .from("product-photos")
      .getPublicUrl(path);
    const photoUrl = `${pub.publicUrl}?t=${Date.now()}`;

    const { error } = await supabase
      .from("products")
      .update({ photo_url: photoUrl })
      .eq("id", productId);

    if (error) return { success: false, message: error.message };
    await afterInventoryWrite();
    return { success: true, message: "Foto diunggah" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function deleteInventoryProduct(id: string): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };

    const { data: product } = await supabase
      .from("products")
      .select("id, photo_url, parent_id")
      .eq("id", id)
      .maybeSingle();

    if (!product) return { success: false, message: "Barang tidak ditemukan" };

    const { data: children } = await supabase
      .from("products")
      .select("id")
      .eq("parent_id", id);

    if (product.photo_url?.includes("/product-photos/")) {
      const oldPath = product.photo_url
        .split("/product-photos/")[1]
        ?.split("?")[0];
      if (oldPath) await supabase.storage.from("product-photos").remove([oldPath]);
    }

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return { success: false, message: error.message };
    await afterInventoryWrite();
    return {
      success: true,
      message:
        children && children.length > 0
          ? "Produk & semua variannya dihapus permanen"
          : "Barang & foto dihapus permanen",
    };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function createStockMovement(
  input: MovementFormValues
): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = movementSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: "Validasi gagal" };

    const d = parsed.data;
    const fromId = d.from_warehouse_id || null;
    const toId = d.to_warehouse_id || null;

    if (d.type === "IN" && !toId) {
      return { success: false, message: "Pilih gudang tujuan" };
    }
    if (d.type === "OUT" && !fromId) {
      return { success: false, message: "Pilih gudang asal" };
    }
    if (d.type === "TRANSFER") {
      if (!fromId || !toId) {
        return { success: false, message: "Pilih gudang asal dan tujuan" };
      }
      if (fromId === toId) {
        return {
          success: false,
          message: "Gudang asal dan tujuan harus berbeda",
        };
      }
    }

    return moveStock({
      type: d.type,
      productId: d.product_id,
      qty: d.qty,
      fromWarehouseId: fromId,
      toWarehouseId: toId,
      note: d.note?.trim() || null,
    });
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

function resolveStockEdgeUrl(): string | null {
  return (
    (import.meta.env.VITE_EDGE_APPLY_SALE_STOCK_URL as string | undefined)?.trim() ||
    null
  );
}

async function postStockEdge(
  body: Record<string, unknown>
): Promise<ActionState> {
  const stockUrl = resolveStockEdgeUrl();
  if (!stockUrl) {
    return {
      success: false,
      message:
        "Mutasi stok belum aktif (set VITE_EDGE_APPLY_SALE_STOCK_URL + deploy Edge)",
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, message: "Anda harus login" };
  }

  const res = await fetch(stockUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const resBody = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    return {
      success: false,
      message: resBody.message || "Gagal memproses mutasi stok",
    };
  }
  await afterInventoryWrite();
  return { success: true };
}

export async function deleteStockMovement(id: string): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsedId = dbId().safeParse(id);
    if (!parsedId.success) {
      return { success: false, message: "ID mutasi tidak valid" };
    }

    const result = await postStockEdge({
      action: "delete_movement",
      movementId: parsedId.data,
    });
    if (!result.success) return result;
    return { success: true, message: "Riwayat mutasi dihapus" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}

export async function updateStockMovement(
  id: string,
  input: MovementFormValues
): Promise<ActionState> {
  try {
    const auth = await requireInventoryWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsedId = dbId().safeParse(id);
    if (!parsedId.success) {
      return { success: false, message: "ID mutasi tidak valid" };
    }
    const parsed = movementSchema.safeParse(input);
    if (!parsed.success) return { success: false, message: "Validasi gagal" };

    const d = parsed.data;
    const fromId = d.from_warehouse_id || null;
    const toId = d.to_warehouse_id || null;

    if (d.type === "IN" && !toId) {
      return { success: false, message: "Pilih gudang tujuan" };
    }
    if (d.type === "OUT" && !fromId) {
      return { success: false, message: "Pilih gudang asal" };
    }
    if (d.type === "TRANSFER") {
      if (!fromId || !toId) {
        return { success: false, message: "Pilih gudang asal dan tujuan" };
      }
      if (fromId === toId) {
        return {
          success: false,
          message: "Gudang asal dan tujuan harus berbeda",
        };
      }
    }

    const result = await postStockEdge({
      action: "edit_movement",
      movementId: parsedId.data,
      type: d.type,
      productId: d.product_id,
      qty: d.qty,
      fromWarehouseId: fromId,
      toWarehouseId: toId,
      note: d.note?.trim() || null,
    });
    if (!result.success) return result;
    return { success: true, message: "Riwayat mutasi diperbarui" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Terjadi kesalahan",
    };
  }
}
