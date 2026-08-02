import type { ActionState } from "@/types/common";
import { supabase } from "@/lib/supabase";
import { hppItemSchema, type HppItemFormValues } from "@/lib/validation";

export interface HppItemRow {
  id: string;
  transaction_id: string;
  name: string;
  amount: number;
  note: string | null;
  created_at: string;
}

async function requireOwner() {
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

  if (!profile || profile.role !== "OWNER") {
    return {
      ok: false as const,
      message: "Hanya Owner yang dapat mengelola HPP",
    };
  }
  return { ok: true as const, user };
}

export async function listHppItems(
  transactionId: string
): Promise<ActionState<HppItemRow[]>> {
  try {
    const { data, error } = await supabase
      .from("hpp_items")
      .select("id, transaction_id, name, amount, note, created_at")
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true });

    if (error) return { success: false, message: error.message };

    return {
      success: true,
      data: (data || []).map((row) => ({
        ...row,
        amount: Number(row.amount),
      })),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal memuat item HPP",
    };
  }
}

export async function addHppItem(
  formData: HppItemFormValues
): Promise<ActionState<HppItemRow>> {
  try {
    const parsed = hppItemSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: "Validasi gagal",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("id, status")
      .eq("id", parsed.data.transaction_id)
      .maybeSingle();

    if (txError) return { success: false, message: txError.message };
    if (!tx) return { success: false, message: "Transaksi tidak ditemukan" };
    if (tx.status === "BATAL") {
      return { success: false, message: "Transaksi sudah dibatalkan" };
    }

    const { data: item, error } = await supabase
      .from("hpp_items")
      .insert({
        transaction_id: parsed.data.transaction_id,
        name: parsed.data.name,
        amount: parsed.data.amount,
        note: parsed.data.note || null,
        created_by: auth.user.id,
      })
      .select("id, transaction_id, name, amount, note, created_at")
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!item) return { success: false, message: "Gagal menambahkan item HPP" };

    return {
      success: true,
      message: `Item HPP "${parsed.data.name}" berhasil ditambahkan`,
      data: { ...item, amount: Number(item.amount) },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menambah HPP",
    };
  }
}

export async function updateHppItem(
  id: string,
  formData: HppItemFormValues
): Promise<ActionState> {
  try {
    const parsed = hppItemSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: "Validasi gagal",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const { data: existing, error: checkError } = await supabase
      .from("hpp_items")
      .select("id, transaction_id")
      .eq("id", id)
      .maybeSingle();

    if (checkError) return { success: false, message: checkError.message };
    if (!existing) return { success: false, message: "Item HPP tidak ditemukan" };

    const { data: tx } = await supabase
      .from("transactions")
      .select("status")
      .eq("id", existing.transaction_id)
      .maybeSingle();

    if (tx?.status === "BATAL") {
      return { success: false, message: "Transaksi sudah dibatalkan" };
    }

    const { error } = await supabase
      .from("hpp_items")
      .update({
        name: parsed.data.name,
        amount: parsed.data.amount,
        note: parsed.data.note || null,
      })
      .eq("id", id);

    if (error) return { success: false, message: error.message };

    return {
      success: true,
      message: `Item HPP "${parsed.data.name}" berhasil diupdate`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat update HPP",
    };
  }
}

export async function deleteHppItem(id: string): Promise<ActionState> {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const { data: existing, error: checkError } = await supabase
      .from("hpp_items")
      .select("id, transaction_id")
      .eq("id", id)
      .maybeSingle();

    if (checkError) return { success: false, message: checkError.message };
    if (!existing) return { success: false, message: "Item HPP tidak ditemukan" };

    const { data: tx } = await supabase
      .from("transactions")
      .select("status")
      .eq("id", existing.transaction_id)
      .maybeSingle();

    if (tx?.status === "BATAL") {
      return { success: false, message: "Transaksi sudah dibatalkan" };
    }

    const { error } = await supabase.from("hpp_items").delete().eq("id", id);
    if (error) return { success: false, message: error.message };

    return { success: true, message: "Item HPP berhasil dihapus" };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat hapus HPP",
    };
  }
}
