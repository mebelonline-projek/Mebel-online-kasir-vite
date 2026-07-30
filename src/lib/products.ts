import type { ActionState } from "@/types/common";
import { supabase } from "@/lib/supabase";
import {
  categorySchema,
  productSchema,
  type CategoryFormValues,
  type ProductFormValues,
} from "@/lib/validation";

export interface ProductRow {
  id: string;
  name: string;
  category: string;
  category_id: string | null;
  description: string | null;
  base_price: number;
  unit: string;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  name: string;
}

async function requireWriter() {
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
      message: "Hanya Owner/Gudang yang bisa mengelola produk",
    };
  }
  return { ok: true as const, user, role: profile.role as string };
}

export async function listCategories(): Promise<ActionState<CategoryRow[]>> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("id, name")
    .order("name");
  if (error) return { success: false, message: error.message };
  return { success: true, data: (data || []) as CategoryRow[] };
}

export async function createCategory(
  formData: CategoryFormValues
): Promise<ActionState<{ id: string }>> {
  const auth = await requireWriter();
  if (!auth.ok) return { success: false, message: auth.message };
  const parsed = categorySchema.safeParse(formData);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message || "Validasi gagal",
    };
  }
  const { data, error } = await supabase
    .from("product_categories")
    .insert({ name: parsed.data.name.trim() })
    .select("id")
    .maybeSingle();
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: "Gagal menambah kategori" };
  return {
    success: true,
    data: { id: data.id },
    message: "Kategori ditambahkan",
  };
}

export async function listProducts(
  limit = 300
): Promise<ActionState<ProductRow[]>> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, name, category, category_id, description, base_price, unit, created_at"
      )
      .order("name")
      .limit(limit);
    if (error) return { success: false, message: error.message };
    return {
      success: true,
      data: (data || []).map((p) => ({
        ...p,
        base_price: Number(p.base_price),
        unit: p.unit || "pcs",
      })) as ProductRow[],
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Gagal memuat produk",
    };
  }
}

export async function createProduct(
  formData: ProductFormValues
): Promise<ActionState<{ id: string }>> {
  try {
    const auth = await requireWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = productSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }

    const { data: cat } = await supabase
      .from("product_categories")
      .select("name")
      .eq("id", parsed.data.category_id)
      .maybeSingle();
    if (!cat) {
      return {
        success: false,
        message: "Kategori tidak ditemukan. Buat kategori dulu.",
      };
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        name: parsed.data.name.trim(),
        category_id: parsed.data.category_id,
        category: cat.name || "LAINNYA",
        base_price: parsed.data.base_price,
        unit: "pcs",
        description: parsed.data.description?.trim() || null,
        created_by: auth.user.id,
      })
      .select("id")
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!data) return { success: false, message: "Gagal menambah produk" };

    const { data: whs } = await supabase
      .from("warehouses")
      .select("id")
      .eq("is_active", true);
    if (whs?.length) {
      const { error: stockErr } = await supabase.from("warehouse_stocks").insert(
        whs.map((w) => ({
          warehouse_id: w.id,
          product_id: data.id,
          qty: 0,
        }))
      );
      if (stockErr) {
        return {
          success: false,
          message: `Produk dibuat, tapi gagal inisialisasi stok: ${stockErr.message}`,
        };
      }
    }

    return {
      success: true,
      data: { id: data.id },
      message: "Produk ditambahkan (stok 0 — isi via Mutasi di Next/Gudang)",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function updateProduct(
  id: string,
  formData: ProductFormValues
): Promise<ActionState> {
  try {
    const auth = await requireWriter();
    if (!auth.ok) return { success: false, message: auth.message };
    const parsed = productSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }

    const { data: cat } = await supabase
      .from("product_categories")
      .select("name")
      .eq("id", parsed.data.category_id)
      .maybeSingle();

    const { error } = await supabase
      .from("products")
      .update({
        name: parsed.data.name.trim(),
        category_id: parsed.data.category_id,
        category: cat?.name || "LAINNYA",
        base_price: parsed.data.base_price,
        description: parsed.data.description?.trim() || null,
      })
      .eq("id", id);

    if (error) return { success: false, message: error.message };
    return { success: true, message: "Produk diperbarui" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function deleteProduct(id: string): Promise<ActionState> {
  try {
    const auth = await requireWriter();
    if (!auth.ok) return { success: false, message: auth.message };

    const { data: stocks } = await supabase
      .from("warehouse_stocks")
      .select("qty")
      .eq("product_id", id);
    if (stocks?.some((s) => Number(s.qty) > 0)) {
      return {
        success: false,
        message: "Produk masih punya stok. Kosongkan dulu lewat mutasi.",
      };
    }

    await supabase.from("warehouse_stocks").delete().eq("product_id", id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return { success: false, message: error.message };
    return { success: true, message: "Produk dihapus" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}
