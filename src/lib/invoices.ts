import type { ActionState } from "@/types/common";
import { totalTagihan } from "@/lib/customer-charges";
import { supabase } from "@/lib/supabase";

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  status: string;
  total_amount: number;
  total_paid: number;
  remaining_amount: number;
  created_at: string;
}

export interface InvoiceDetail {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  status: string;
  total_amount: number;
  total_paid: number;
  remaining_amount: number;
  notes: string | null;
  created_at: string;
  invoice_items?: Array<{
    id: string;
    transaction_id: string;
    transactions?: {
      id: string;
      transaction_number: string;
      final_price: number;
      status: string;
      payment_type: string;
      dp_amount: number;
    } | null;
  }>;
}

export interface StoreSettingsRow {
  store_name: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
}

export interface InvoicesListResult {
  data: InvoiceListItem[];
  total: number;
  totalPages: number;
  currentPage: number;
}

export async function getStoreSettings(): Promise<StoreSettingsRow | null> {
  const { data } = await supabase
    .from("store_settings")
    .select("store_name, address, phone, logo_url")
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getInvoices(params: {
  q?: string;
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<ActionState<InvoicesListResult>> {
  try {
    const { q = "", status = "", page = 1, limit = 10 } = params;
    const offset = (page - 1) * limit;

    let query = supabase.from("invoices").select(
      `
        id,
        invoice_number,
        customer_name,
        status,
        total_amount,
        total_paid,
        remaining_amount,
        notes,
        created_by,
        created_at,
        updated_at
      `,
      { count: "exact" }
    );

    if (status && status !== "semua") {
      query = query.eq("status", status);
    }

    if (q) {
      // Strip PostgREST filter metacharacters from user search
      const safeQ = q.replace(/[%_,.()\\]/g, " ").replace(/\s+/g, " ").trim();
      if (safeQ) {
        query = query.or(
          `invoice_number.ilike.%${safeQ}%,customer_name.ilike.%${safeQ}%`
        );
      }
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return {
        success: false,
        message: error.message,
        data: { data: [], total: 0, totalPages: 0, currentPage: page },
      };
    }

    const totalPages = Math.ceil((count || 0) / limit);

    return {
      success: true,
      data: {
        data: (data || []) as InvoiceListItem[],
        total: count || 0,
        totalPages,
        currentPage: page,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
      data: { data: [], total: 0, totalPages: 0, currentPage: 1 },
    };
  }
}

export async function getInvoiceById(
  id: string
): Promise<ActionState<InvoiceDetail>> {
  try {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        customer_name,
        status,
        total_amount,
        total_paid,
        remaining_amount,
        notes,
        created_by,
        created_at,
        updated_at,
        invoice_items (
          id,
          transaction_id,
          transactions:transaction_id (
            id,
            transaction_number,
            final_price,
            status,
            payment_type,
            dp_amount
          )
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!data) return { success: false, message: "Invoice tidak ditemukan" };

    return { success: true, data: data as unknown as InvoiceDetail };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function createInvoice(input: {
  customer_name?: string;
  transaction_ids: string[];
  notes?: string;
}): Promise<ActionState<{ id: string; invoice_number: string }>> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, message: "Anda harus login" };
    }

    if (!input.transaction_ids || input.transaction_ids.length === 0) {
      return { success: false, message: "Pilih minimal 1 transaksi" };
    }

    const { data: existingLinks, error: linkErr } = await supabase
      .from("invoice_items")
      .select("transaction_id")
      .in("transaction_id", input.transaction_ids);

    if (linkErr) {
      return { success: false, message: linkErr.message };
    }

    if (existingLinks && existingLinks.length > 0) {
      return {
        success: false,
        message: `${existingLinks.length} transaksi sudah terikat ke invoice lain. Hapus dari invoice lama terlebih dahulu.`,
      };
    }

    const { data: txs, error: txErr } = await supabase
      .from("transactions")
      .select("id, final_price, status")
      .in("id", input.transaction_ids);

    if (txErr) return { success: false, message: txErr.message };
    if (!txs || txs.length === 0) {
      return { success: false, message: "Transaksi tidak ditemukan" };
    }

    if (txs.some((t) => t.status === "BATAL")) {
      return {
        success: false,
        message: "Tidak bisa membuat invoice dari transaksi yang dibatalkan",
      };
    }

    if (txs.some((t) => t.status === "LUNAS")) {
      return {
        success: false,
        message:
          "Transaksi yang sudah lunas tidak bisa dibuat invoice. Gunakan Nota sebagai bukti bayar.",
      };
    }

    const eligibleStatuses = ["DP", "MENUNGGU_PELUNASAN"];
    if (txs.some((t) => !eligibleStatuses.includes(t.status))) {
      return {
        success: false,
        message:
          "Invoice hanya bisa dibuat dari transaksi DP atau menunggu pelunasan",
      };
    }

    const { data: chargeRows } = await supabase
      .from("transaction_customer_charges")
      .select("transaction_id, amount")
      .in("transaction_id", input.transaction_ids);

    const chargesByTx = new Map<string, number>();
    for (const c of chargeRows || []) {
      chargesByTx.set(
        c.transaction_id,
        (chargesByTx.get(c.transaction_id) || 0) + Number(c.amount || 0)
      );
    }

    const totalAmount = txs.reduce(
      (sum, t) =>
        sum +
        totalTagihan(Number(t.final_price), [
          { amount: chargesByTx.get(t.id) || 0 },
        ]),
      0
    );

    const { data: payments } = await supabase
      .from("transaction_payments")
      .select("amount")
      .in("transaction_id", input.transaction_ids);

    const totalPaid = (payments || []).reduce((sum, p) => sum + p.amount, 0);
    const remaining = totalAmount - totalPaid;

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .insert({
        customer_name: input.customer_name || null,
        total_amount: totalAmount,
        total_paid: totalPaid,
        remaining_amount: remaining,
        notes: input.notes || null,
        created_by: user.id,
      })
      .select("id, invoice_number")
      .maybeSingle();

    if (invErr) return { success: false, message: invErr.message };
    if (!invoice) return { success: false, message: "Gagal membuat invoice" };

    const items = input.transaction_ids.map((txId) => ({
      invoice_id: invoice.id,
      transaction_id: txId,
    }));

    const { error: itemErr } = await supabase
      .from("invoice_items")
      .insert(items);
    if (itemErr) {
      await supabase.from("invoices").delete().eq("id", invoice.id);
      return {
        success: false,
        message: `Gagal menambahkan item invoice: ${itemErr.message}`,
      };
    }

    return {
      success: true,
      message: `Invoice ${invoice.invoice_number} berhasil dibuat`,
      data: { id: invoice.id, invoice_number: invoice.invoice_number },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat membuat invoice",
    };
  }
}

export async function deleteInvoice(id: string): Promise<ActionState> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, message: "Anda harus login" };
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "OWNER") {
      return { success: false, message: "Hanya Owner yang bisa menghapus invoice" };
    }

    const { data: existing } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return { success: false, message: "Invoice tidak ditemukan" };

    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) return { success: false, message: error.message };

    return {
      success: true,
      message: `Invoice ${existing.invoice_number} berhasil dihapus`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menghapus invoice",
    };
  }
}

export interface EligibleInvoiceTransaction {
  id: string;
  transaction_number: string;
  final_price: number;
  status: string;
  created_at: string;
  customer_name: string | null;
  remaining: number;
}

export async function getEligibleInvoiceTransactions(): Promise<
  ActionState<EligibleInvoiceTransaction[]>
> {
  try {
    const [
      { data: txs, error: txErr },
      { data: linked },
      { data: payments },
      { data: charges },
    ] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id, transaction_number, final_price, status, created_at, customer_name"
        )
        .in("status", ["DP", "MENUNGGU_PELUNASAN"])
        .order("created_at", { ascending: false }),
      supabase.from("invoice_items").select("transaction_id"),
      supabase.from("transaction_payments").select("transaction_id, amount"),
      supabase
        .from("transaction_customer_charges")
        .select("transaction_id, amount"),
    ]);

    if (txErr) return { success: false, message: txErr.message };

    const linkedIds = new Set((linked || []).map((i) => i.transaction_id));
    const paidByTx = new Map<string, number>();
    for (const p of payments || []) {
      paidByTx.set(
        p.transaction_id,
        (paidByTx.get(p.transaction_id) || 0) + p.amount
      );
    }
    const chargesByTx = new Map<string, number>();
    for (const c of charges || []) {
      chargesByTx.set(
        c.transaction_id,
        (chargesByTx.get(c.transaction_id) || 0) + Number(c.amount || 0)
      );
    }

    const available = (txs || [])
      .filter((t) => !linkedIds.has(t.id))
      .map((t) => {
        const due = totalTagihan(Number(t.final_price), [
          { amount: chargesByTx.get(t.id) || 0 },
        ]);
        return {
          ...t,
          final_price: due,
          remaining: due - (paidByTx.get(t.id) || 0),
        };
      })
      .filter((t) => t.remaining > 0);

    return { success: true, data: available };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}
