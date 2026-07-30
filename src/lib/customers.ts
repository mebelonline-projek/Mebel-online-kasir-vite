import type { ActionState } from "@/types/common";
import { supabase } from "@/lib/supabase";
import { customerSchema, type CustomerFormValues } from "@/lib/validation";

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
}

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function requireOwner() {
  const user = await requireUser();
  if (!user) return { ok: false as const, message: "Anda harus login" };
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "OWNER") {
    return { ok: false as const, message: "Hanya Owner yang bisa melakukan ini" };
  }
  return { ok: true as const, user };
}

export async function listCustomers(
  limit = 300
): Promise<ActionState<CustomerRow[]>> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, address, note, created_at")
      .order("name")
      .limit(limit);
    if (error) return { success: false, message: error.message };
    return { success: true, data: (data || []) as CustomerRow[] };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Gagal memuat pelanggan",
    };
  }
}

export async function createCustomer(
  formData: CustomerFormValues
): Promise<ActionState<{ id: string }>> {
  try {
    const parsed = customerSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }
    const user = await requireUser();
    if (!user) return { success: false, message: "Anda harus login" };

    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        note: parsed.data.note || null,
        created_by: user.id,
      })
      .select("id")
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!data) return { success: false, message: "Gagal menambahkan pelanggan" };
    return {
      success: true,
      data: { id: data.id },
      message: "Pelanggan berhasil ditambahkan",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function updateCustomer(
  id: string,
  formData: CustomerFormValues
): Promise<ActionState> {
  try {
    const parsed = customerSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }
    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const { error } = await supabase
      .from("customers")
      .update({
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        note: parsed.data.note || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { success: false, message: error.message };
    return { success: true, message: "Pelanggan berhasil diupdate" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function deleteCustomer(id: string): Promise<ActionState> {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return { success: false, message: error.message };
    return { success: true, message: "Pelanggan berhasil dihapus" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}
