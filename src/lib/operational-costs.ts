import type { ActionState } from "@/types/common";
import { getWibDateString } from "@/lib/date-utils";
import { supabase } from "@/lib/supabase";
import {
  operationalCostSchema,
  type OperationalCostFormValues,
} from "@/lib/validation";

export interface OperationalCostRow {
  id: string;
  name: string;
  amount: number;
  category: string;
  created_at: string;
}

export interface OperationalCostsListResult {
  costs: OperationalCostRow[];
  total: number;
  totalPages: number;
  distinctCategories: string[];
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
    return {
      ok: false as const,
      message: "Hanya Owner yang bisa mengubah biaya operasional",
    };
  }
  return { ok: true as const, user };
}

function resolvePeriodRange(params: {
  bulan?: string;
  dari?: string;
  sampai?: string;
}): { start: string; end: string } {
  const { bulan, dari, sampai } = params;

  if (dari && sampai) {
    const endDate = new Date(`${sampai}T12:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    const y = endDate.getFullYear();
    const m = String(endDate.getMonth() + 1).padStart(2, "0");
    const d = String(endDate.getDate()).padStart(2, "0");
    return { start: dari, end: `${y}-${m}-${d}` };
  }

  if (bulan) {
    const [tahun, bulanNum] = bulan.split("-").map(Number);
    const start = `${tahun}-${String(bulanNum).padStart(2, "0")}-01`;
    const nextMonth = bulanNum === 12 ? 1 : bulanNum + 1;
    const nextYear = bulanNum === 12 ? tahun + 1 : tahun;
    const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
    return { start, end };
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const start = `${y}-${m}-01`;
  const nextMonth = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  const nextYear = now.getMonth() === 11 ? y + 1 : y;
  const end = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-01`;
  return { start, end };
}

export async function listOperationalCosts(
  params: {
    bulan?: string;
    dari?: string;
    sampai?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<ActionState<OperationalCostsListResult>> {
  try {
    const { page = 1, limit = 10 } = params;
    const offset = (page - 1) * limit;
    const { start, end } = resolvePeriodRange(params);

    const [{ data: costs, count: total, error }, { data: allCategories }] =
      await Promise.all([
        supabase
          .from("operational_costs")
          .select("*", { count: "exact" })
          .lte("period_start", end)
          .gte("period_end", start)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1),
        supabase
          .from("operational_costs")
          .select("category")
          .not("category", "is", null),
      ]);

    if (error) return { success: false, message: error.message };

    const distinctCategories = [
      ...new Set(
        (allCategories || [])
          .map((r) => r.category)
          .filter((c): c is string => Boolean(c))
      ),
    ].sort();

    return {
      success: true,
      data: {
        costs: (costs || []) as OperationalCostRow[],
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit),
        distinctCategories,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal memuat biaya operasional",
    };
  }
}

export async function createOperationalCost(
  formData: OperationalCostFormValues
): Promise<ActionState<{ id: string }>> {
  try {
    const parsed = operationalCostSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }

    const user = await requireUser();
    if (!user) return { success: false, message: "Anda harus login" };

    const today = getWibDateString();
    const { data, error } = await supabase
      .from("operational_costs")
      .insert({
        name: parsed.data.name,
        amount: parsed.data.amount,
        category: parsed.data.category || "LAINNYA",
        period_start: today,
        period_end: today,
        created_by: user.id,
      })
      .select("id")
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!data) {
      return { success: false, message: "Gagal menambahkan biaya operasional" };
    }
    return {
      success: true,
      data: { id: data.id },
      message: "Biaya berhasil ditambahkan",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function updateOperationalCost(
  id: string,
  formData: OperationalCostFormValues
): Promise<ActionState> {
  try {
    const parsed = operationalCostSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }

    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const { error } = await supabase
      .from("operational_costs")
      .update({
        name: parsed.data.name,
        amount: parsed.data.amount,
        category: parsed.data.category || "LAINNYA",
      })
      .eq("id", id);

    if (error) return { success: false, message: error.message };
    return { success: true, message: "Biaya berhasil diupdate" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function deleteOperationalCost(id: string): Promise<ActionState> {
  try {
    const auth = await requireOwner();
    if (!auth.ok) {
      return {
        success: false,
        message:
          auth.message === "Hanya Owner yang bisa mengubah biaya operasional"
            ? "Hanya Owner yang bisa menghapus biaya operasional"
            : auth.message,
      };
    }

    const { error } = await supabase
      .from("operational_costs")
      .delete()
      .eq("id", id);

    if (error) return { success: false, message: error.message };
    return { success: true, message: "Biaya berhasil dihapus" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}
