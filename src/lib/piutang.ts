import type { ActionState } from "@/types/common";
import { supabase } from "@/lib/supabase";

export interface PiutangRow {
  id: string;
  transaction_number: string;
  customer_name: string | null;
  final_price: number;
  status: string;
  created_at: string;
  paid: number;
  remaining: number;
}

export interface PiutangPageData {
  piutangList: PiutangRow[];
  totalPiutang: number;
}

export async function getPiutangPageData(): Promise<
  ActionState<PiutangPageData>
> {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, message: "Anda harus login" };
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "OWNER") {
      return { success: false, message: "Hanya Owner yang bisa melihat piutang" };
    }

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select(
        "id, transaction_number, customer_name, final_price, status, created_at"
      )
      .in("status", ["DP", "MENUNGGU_PELUNASAN"])
      .order("created_at", { ascending: false });

    if (error) return { success: false, message: error.message };

    const txIds = (transactions || []).map((t) => t.id);
    const { data: payments } = txIds.length
      ? await supabase
          .from("transaction_payments")
          .select("transaction_id, amount")
          .in("transaction_id", txIds)
      : { data: [] as { transaction_id: string; amount: number }[] };

    const paidMap = new Map<string, number>();
    for (const p of payments || []) {
      paidMap.set(
        p.transaction_id,
        (paidMap.get(p.transaction_id) || 0) + Number(p.amount)
      );
    }

    const piutangList = (transactions || [])
      .map((tx) => {
        const paid = paidMap.get(tx.id) || 0;
        const remaining = Number(tx.final_price) - paid;
        return {
          id: tx.id,
          transaction_number: tx.transaction_number,
          customer_name: tx.customer_name,
          final_price: Number(tx.final_price),
          status: tx.status,
          created_at: tx.created_at,
          paid,
          remaining,
        };
      })
      .filter((tx) => tx.remaining > 0);

    const totalPiutang = piutangList.reduce((sum, tx) => sum + tx.remaining, 0);

    return {
      success: true,
      data: { piutangList, totalPiutang },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Gagal memuat piutang",
    };
  }
}
