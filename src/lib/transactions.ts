import type { ActionState } from "@/types/common";
import type {
  FulfillmentUpdateValues,
  TransactionCreateValues,
  TransactionFormValues,
} from "@/lib/validation";
import {
  fulfillmentUpdateSchema,
  paymentSchema,
  transactionCreateSchema,
  transactionSchema,
  type PaymentFormValues,
} from "@/lib/validation";
import { supabase } from "@/lib/supabase";
import { toRupiahInteger } from "@/lib/money";
import { getWibDateString, wibNoonISO } from "@/lib/date-utils";

export interface TransactionRow {
  id: string;
  transaction_number: string;
  customer_name: string | null;
  description: string | null;
  final_price: number;
  payment_type: "CASH" | "DP";
  dp_amount: number;
  status: string;
  fulfillment_status?: string | null;
  created_at: string;
  client_id?: string | null;
}

export interface TransactionPaymentRow {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  note: string | null;
}

export interface TransactionItemDetail {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  note: string | null;
  sort_order: number;
}

export interface TransactionHppItem {
  id: string;
  name: string;
  amount: number;
  note: string | null;
  created_at?: string;
}

export interface TransactionDetail {
  id: string;
  transaction_number: string;
  customer_id: string | null;
  product_id: string | null;
  customer_name: string | null;
  description: string | null;
  final_price: number;
  payment_type: "CASH" | "DP";
  dp_amount: number;
  status: string;
  fulfillment_status: string | null;
  created_at: string;
  void_reason: string | null;
  void_at: string | null;
  transaction_items: TransactionItemDetail[];
  transaction_payments: TransactionPaymentRow[];
  hpp_items: TransactionHppItem[];
}

async function restoreSaleStockViaEdge(
  transactionId: string
): Promise<{ ok: boolean; message: string }> {
  const stockUrl = (
    import.meta.env.VITE_EDGE_APPLY_SALE_STOCK_URL as string | undefined
  )?.trim();

  if (!stockUrl) {
    return {
      ok: false,
      message: "Edge apply-sale-stock belum dikonfigurasi",
    };
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(stockUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        action: "restore",
        transactionId,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      return {
        ok: false,
        message: body.message || `HTTP ${res.status}`,
      };
    }

    return { ok: true, message: "Stok dikembalikan" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "error restore",
    };
  }
}

async function syncLinkedInvoiceTotals(transactionIds: string[]): Promise<void> {
  if (transactionIds.length === 0) return;

  const { data: linkedItems } = await supabase
    .from("invoice_items")
    .select("invoice_id, transaction_id")
    .in("transaction_id", transactionIds);

  if (!linkedItems || linkedItems.length === 0) return;

  const invoiceIds = [...new Set(linkedItems.map((i) => i.invoice_id))];

  const { data: allInvoiceItems } = await supabase
    .from("invoice_items")
    .select("invoice_id, transaction_id")
    .in("invoice_id", invoiceIds);

  if (!allInvoiceItems || allInvoiceItems.length === 0) return;

  const allTxIds = [...new Set(allInvoiceItems.map((i) => i.transaction_id))];

  const [{ data: allTx }, { data: allPayments }, { data: allInvoices }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id, final_price, status")
        .in("id", allTxIds),
      supabase
        .from("transaction_payments")
        .select("amount, transaction_id")
        .in("transaction_id", allTxIds),
      supabase.from("invoices").select("id, status").in("id", invoiceIds),
    ]);

  const txMap = new Map((allTx || []).map((t) => [t.id, t]));
  const invStatusMap = new Map((allInvoices || []).map((i) => [i.id, i.status]));

  await Promise.all(
    invoiceIds.map(async (invoiceId) => {
      const itemTxIds = allInvoiceItems
        .filter((i) => i.invoice_id === invoiceId)
        .map((i) => i.transaction_id);

      const validTxIds = itemTxIds.filter((tid) => {
        const tx = txMap.get(tid);
        return tx && tx.status !== "BATAL";
      });

      if (validTxIds.length === 0) {
        return supabase
          .from("invoices")
          .update({
            total_amount: 0,
            total_paid: 0,
            remaining_amount: 0,
            status: "CANCELLED",
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId);
      }

      const totalAmount = validTxIds.reduce(
        (sum, tid) => sum + Number(txMap.get(tid)?.final_price || 0),
        0
      );
      const totalPaid = (allPayments || [])
        .filter((p) => validTxIds.includes(p.transaction_id))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const remaining = totalAmount - totalPaid;

      const currentStatus = invStatusMap.get(invoiceId);
      let newStatus: "DRAFT" | "SENT" | "PAID" | "CANCELLED";
      if (remaining <= 0 && totalAmount > 0) {
        newStatus = "PAID";
      } else if (currentStatus === "PAID" && remaining > 0) {
        newStatus = "SENT";
      } else if (currentStatus === "CANCELLED") {
        newStatus = "DRAFT";
      } else {
        newStatus = (currentStatus as typeof newStatus) || "DRAFT";
      }

      return supabase
        .from("invoices")
        .update({
          total_amount: totalAmount,
          total_paid: totalPaid,
          remaining_amount: remaining,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);
    })
  );
}

/**
 * Buat transaksi lewat client Supabase + RLS.
 * Idempoten jika `client_id` sudah ada (offline sync aman).
 *
 * Catatan stok: potong stok katalog membutuhkan Edge Function
 * `apply-sale-stock` (Fase 3). Tanpa itu, item tanpa product_id tetap aman.
 */
export async function createTransaction(
  formData: TransactionCreateValues
): Promise<ActionState<{ id: string; transaction_number: string }>> {
  try {
    const parsed = transactionCreateSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: "Validasi gagal",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, message: "Anda harus login" };
    }

    const data = parsed.data;
    const isCash = data.payment_type === "CASH";
    const status = isCash ? "LUNAS" : "DP";
    const businessDate =
      data.transaction_date && data.transaction_date.length > 0
        ? data.transaction_date
        : getWibDateString();
    const businessTimestamp = wibNoonISO(businessDate);

    const itemsTotal =
      data.items && data.items.length > 0
        ? data.items.reduce(
            (sum, item) =>
              sum +
              toRupiahInteger(item.quantity) * toRupiahInteger(item.unit_price),
            0
          )
        : 0;
    const finalPrice = toRupiahInteger(
      itemsTotal > 0 ? itemsTotal : data.final_price
    );
    const dpAmount = toRupiahInteger(isCash ? finalPrice : data.dp_amount);
    const description =
      data.items && data.items.length > 0
        ? data.items.map((i) => i.product_name).join(", ")
        : data.description || null;
    const firstProductId =
      data.items && data.items.length > 0 && data.items[0].product_id
        ? data.items[0].product_id
        : data.product_id && data.product_id.length > 0
          ? data.product_id
          : null;

    if (data.payment_type === "DP" && data.dp_amount >= finalPrice) {
      return { success: false, message: "DP harus kurang dari harga final" };
    }

    if (data.client_id) {
      const { data: existing } = await supabase
        .from("transactions")
        .select("id, transaction_number")
        .eq("client_id", data.client_id)
        .maybeSingle();

      if (existing) {
        return {
          success: true,
          message: `Transaksi ${existing.transaction_number} sudah tersinkronkan`,
          data: {
            id: existing.id,
            transaction_number: existing.transaction_number,
          },
        };
      }
    }

    let salesWhId: string | null = null;
    if (data.items && data.items.length > 0) {
      const catalogItems = data.items.filter(
        (item) => item.product_id && item.product_id.length > 0
      );
      if (catalogItems.length > 0) {
        const { data: salesWh } = await supabase
          .from("warehouses")
          .select("id")
          .eq("is_sales_warehouse", true)
          .eq("is_active", true)
          .maybeSingle();
        salesWhId = salesWh?.id || null;
      }
    }

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        client_id: data.client_id || null,
        customer_id:
          data.customer_id && data.customer_id.length > 0 ? data.customer_id : null,
        product_id: firstProductId,
        customer_name: data.customer_name || null,
        description,
        final_price: finalPrice,
        payment_type: data.payment_type,
        dp_amount: dpAmount,
        status,
        fulfillment_status: "MENUNGGU",
        created_by: user.id,
        created_at: businessTimestamp,
      })
      .select("id, transaction_number")
      .maybeSingle();

    if (txError) {
      return { success: false, message: txError.message };
    }
    if (!transaction) {
      return { success: false, message: "Gagal membuat transaksi" };
    }

    if (data.items && data.items.length > 0) {
      const rows = data.items.map((item, index) => {
        const wh =
          item.warehouse_id && item.warehouse_id.length > 0
            ? item.warehouse_id
            : salesWhId;
        return {
          transaction_id: transaction.id,
          product_id:
            item.product_id && item.product_id.length > 0 ? item.product_id : null,
          product_name: item.product_name,
          quantity: toRupiahInteger(item.quantity),
          unit_price: toRupiahInteger(item.unit_price),
          line_total:
            toRupiahInteger(item.quantity) * toRupiahInteger(item.unit_price),
          note: item.note || null,
          sort_order: index,
          warehouse_id: wh,
        };
      });

      const { error: itemsError } = await supabase
        .from("transaction_items")
        .insert(rows);
      if (itemsError) {
        await supabase.from("transactions").delete().eq("id", transaction.id);
        return {
          success: false,
          message: `Gagal menyimpan item: ${itemsError.message}`,
        };
      }

      // Potong stok via Edge Function jika dikonfigurasi
      const stockUrl = (
        import.meta.env.VITE_EDGE_APPLY_SALE_STOCK_URL as string | undefined
      )?.trim();
      if (stockUrl) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const authHeaders = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        };

        const rollbackStock = async () => {
          await fetch(stockUrl, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              action: "restore",
              transactionId: transaction.id,
            }),
          }).catch(() => undefined);
        };

        for (const row of rows) {
          if (!row.product_id || !row.warehouse_id) continue;
          const res = await fetch(stockUrl, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              productId: row.product_id,
              warehouseId: row.warehouse_id,
              qty: row.quantity,
              transactionId: transaction.id,
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              message?: string;
            };
            await rollbackStock();
            await supabase.from("transactions").delete().eq("id", transaction.id);
            return {
              success: false,
              message:
                body.message ||
                `Stok tidak cukup untuk "${row.product_name}"`,
            };
          }
        }
      }
    }

    const paymentAmount = dpAmount;
    const paymentMethod = data.payment_method || "TUNAI";
    const { error: payError } = await supabase
      .from("transaction_payments")
      .insert({
        transaction_id: transaction.id,
        amount: paymentAmount,
        method: paymentMethod,
        note: isCash ? "Pembayaran Lunas" : "Uang Muka (DP)",
        created_by: user.id,
        payment_date: businessTimestamp,
      });

    if (payError) {
      await supabase.from("transactions").delete().eq("id", transaction.id);
      return {
        success: false,
        message: `Gagal membuat pembayaran: ${payError.message}`,
      };
    }

    return {
      success: true,
      message: isCash
        ? `Transaksi ${transaction.transaction_number} berhasil dibuat (LUNAS)`
        : `Transaksi ${transaction.transaction_number} berhasil dibuat (DP)`,
      data: {
        id: transaction.id,
        transaction_number: transaction.transaction_number,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Gagal membuat transaksi",
    };
  }
}

export async function listRecentTransactions(
  limit = 30
): Promise<ActionState<TransactionRow[]>> {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        "id, transaction_number, customer_name, description, final_price, payment_type, dp_amount, status, fulfillment_status, created_at, client_id"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, data: (data ?? []) as TransactionRow[] };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Gagal memuat transaksi",
    };
  }
}

export async function getTransactionById(
  id: string
): Promise<ActionState<TransactionDetail>> {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        id, transaction_number, customer_id, product_id, customer_name, description, final_price,
        payment_type, dp_amount, status, fulfillment_status, created_at,
        void_reason, void_at,
        transaction_items ( id, product_name, quantity, unit_price, line_total, note, sort_order ),
        transaction_payments ( id, amount, payment_date, method, note ),
        hpp_items ( id, name, amount, note, created_at )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return { success: false, message: error.message };
    if (!data) return { success: false, message: "Transaksi tidak ditemukan" };

    const items = (
      (data.transaction_items as TransactionItemDetail[] | null) || []
    )
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const payments = (
      (data.transaction_payments as TransactionPaymentRow[] | null) || []
    )
      .slice()
      .sort((a, b) =>
        a.payment_date < b.payment_date
          ? -1
          : a.payment_date > b.payment_date
            ? 1
            : 0
      );

    const hppItems = (
      (data.hpp_items as TransactionHppItem[] | null) || []
    ).map((h) => ({
      ...h,
      amount: Number(h.amount),
    }));

    return {
      success: true,
      data: {
        id: data.id,
        transaction_number: data.transaction_number,
        customer_id: data.customer_id ?? null,
        product_id: data.product_id ?? null,
        customer_name: data.customer_name,
        description: data.description,
        final_price: Number(data.final_price),
        payment_type: data.payment_type,
        dp_amount: Number(data.dp_amount),
        status: data.status,
        fulfillment_status: data.fulfillment_status,
        created_at: data.created_at,
        void_reason: data.void_reason ?? null,
        void_at: data.void_at ?? null,
        transaction_items: items.map((i) => ({
          ...i,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
          line_total: Number(i.line_total),
        })),
        transaction_payments: payments.map((p) => ({
          ...p,
          amount: Number(p.amount),
        })),
        hpp_items: hppItems,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal memuat detail transaksi",
    };
  }
}

export async function updateFulfillmentStatus(
  formData: FulfillmentUpdateValues
): Promise<ActionState> {
  try {
    const parsed = fulfillmentUpdateSchema.safeParse(formData);
    if (!parsed.success) {
      return { success: false, message: "Data tidak valid" };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, message: "Anda harus login" };
    }

    const { data: existing } = await supabase
      .from("transactions")
      .select("id, status")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (!existing) {
      return { success: false, message: "Transaksi tidak ditemukan" };
    }
    if (existing.status === "BATAL") {
      return {
        success: false,
        message: "Transaksi batal tidak bisa diubah statusnya",
      };
    }

    const { error } = await supabase
      .from("transactions")
      .update({ fulfillment_status: parsed.data.fulfillment_status })
      .eq("id", parsed.data.id);

    if (error) return { success: false, message: error.message };

    return { success: true, message: "Status pesanan diperbarui" };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function updateTransaction(
  id: string,
  formData: TransactionFormValues
): Promise<ActionState<{ id: string; transaction_number: string }>> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, message: "Anda harus login" };
    }

    const { data: existing, error: checkError } = await supabase
      .from("transactions")
      .select("id, transaction_number, payment_type, status")
      .eq("id", id)
      .maybeSingle();

    if (checkError) return { success: false, message: checkError.message };
    if (!existing) {
      return { success: false, message: "Transaksi tidak ditemukan" };
    }

    if (existing.status === "LUNAS" || existing.status === "BATAL") {
      return {
        success: false,
        message: "Transaksi sudah lunas atau batal, tidak bisa diedit",
      };
    }

    if (existing.status === "MENUNGGU_PELUNASAN") {
      return {
        success: false,
        message:
          "Transaksi sudah ada pelunasan, tidak bisa diedit. Batalkan dulu jika perlu koreksi.",
      };
    }

    const { data: existingPayments, error: payCheckError } = await supabase
      .from("transaction_payments")
      .select("id")
      .eq("transaction_id", id);

    if (payCheckError) {
      return { success: false, message: payCheckError.message };
    }

    if ((existingPayments || []).length > 1) {
      return {
        success: false,
        message:
          "Transaksi memiliki lebih dari satu pembayaran, tidak bisa diedit",
      };
    }

    const parsed = transactionSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: "Validasi gagal",
        errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    if (
      "items" in (formData as object) &&
      Array.isArray((formData as { items?: unknown }).items)
    ) {
      return {
        success: false,
        message:
          "Edit item/qty tidak diizinkan setelah stok terpotong. Batalkan (void) lalu buat transaksi baru jika perlu koreksi barang.",
      };
    }

    const data = parsed.data;
    const isCash = data.payment_type === "CASH";
    const finalPrice = toRupiahInteger(data.final_price);
    const dpAmount = toRupiahInteger(isCash ? finalPrice : data.dp_amount);
    const newStatus = isCash ? "LUNAS" : "DP";

    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        customer_id:
          data.customer_id && data.customer_id.length > 0
            ? data.customer_id
            : null,
        product_id:
          data.product_id && data.product_id.length > 0
            ? data.product_id
            : null,
        customer_name: data.customer_name || null,
        description: data.description || null,
        final_price: finalPrice,
        payment_type: data.payment_type,
        dp_amount: dpAmount,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) return { success: false, message: updateError.message };

    const paymentAmount = dpAmount;
    const existingPaymentsList = existingPayments || [];

    if (existingPaymentsList.length > 0) {
      const { error: payError } = await supabase
        .from("transaction_payments")
        .update({
          amount: paymentAmount,
          note: isCash ? "Pembayaran Lunas (edit)" : "Uang Muka (DP) — edit",
        })
        .eq("id", existingPaymentsList[0].id);

      if (payError) {
        return {
          success: false,
          message: `Gagal update pembayaran: ${payError.message}`,
        };
      }
    } else {
      const { error: payError } = await supabase
        .from("transaction_payments")
        .insert({
          transaction_id: id,
          amount: paymentAmount,
          method: data.payment_method || "TUNAI",
          note: isCash ? "Pembayaran Lunas (edit)" : "Uang Muka (DP) — edit",
          created_by: user.id,
        });

      if (payError) {
        return {
          success: false,
          message: `Gagal membuat pembayaran: ${payError.message}`,
        };
      }
    }

    await syncLinkedInvoiceTotals([id]);

    return {
      success: true,
      message: `Transaksi ${existing.transaction_number} berhasil diupdate`,
      data: { id, transaction_number: existing.transaction_number },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function deleteTransactionPermanent(
  id: string
): Promise<ActionState> {
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
      return {
        success: false,
        message: "Hanya Owner yang bisa menghapus transaksi permanen",
      };
    }

    const { data: existing, error: checkError } = await supabase
      .from("transactions")
      .select("id, transaction_number")
      .eq("id", id)
      .maybeSingle();

    if (checkError) return { success: false, message: checkError.message };
    if (!existing) {
      return { success: false, message: "Transaksi tidak ditemukan" };
    }

    const { data: invoiceLinks, error: invCheckError } = await supabase
      .from("invoice_items")
      .select("id, invoice_id")
      .eq("transaction_id", id);

    if (invCheckError) {
      return {
        success: false,
        message: `Gagal cek invoice: ${invCheckError.message}`,
      };
    }

    if (invoiceLinks && invoiceLinks.length > 0) {
      return {
        success: false,
        message: `Transaksi ${existing.transaction_number} terikat ke ${invoiceLinks.length} invoice. Hapus invoice terkait terlebih dahulu.`,
      };
    }

    const restore = await restoreSaleStockViaEdge(id);
    if (!restore.ok) {
      return {
        success: false,
        message: `Tidak bisa hapus: stok gagal dikembalikan (${restore.message}). Void dulu atau cek Mutasi.`,
      };
    }

    await supabase.from("transaction_payments").delete().eq("transaction_id", id);
    await supabase.from("hpp_items").delete().eq("transaction_id", id);

    const { error: deleteError } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);

    if (deleteError) return { success: false, message: deleteError.message };

    return {
      success: true,
      message: `Transaksi ${existing.transaction_number} berhasil dihapus permanen`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menghapus transaksi",
    };
  }
}

export async function voidTransaction(
  id: string,
  reason: string
): Promise<ActionState> {
  try {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      return {
        success: false,
        message: "Alasan pembatalan minimal 3 karakter",
      };
    }

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
      return {
        success: false,
        message: "Hanya Owner yang bisa membatalkan transaksi",
      };
    }

    const { data: existing, error: checkError } = await supabase
      .from("transactions")
      .select("status, transaction_number")
      .eq("id", id)
      .maybeSingle();

    if (checkError) return { success: false, message: checkError.message };
    if (!existing) {
      return { success: false, message: "Transaksi tidak ditemukan" };
    }
    if (existing.status === "BATAL") {
      return { success: false, message: "Transaksi sudah dibatalkan" };
    }

    // Restore stok dulu — jangan set BATAL jika stok gagal dikembalikan
    const restore = await restoreSaleStockViaEdge(id);
    if (!restore.ok) {
      return {
        success: false,
        message: `Stok gagal dikembalikan (${restore.message}). Transaksi belum dibatalkan.`,
      };
    }

    const { error: voidError } = await supabase
      .from("transactions")
      .update({
        status: "BATAL",
        void_reason: trimmed,
        void_by: user.id,
        void_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (voidError) {
      return {
        success: false,
        message: `Stok sudah dikembalikan, tapi status gagal diubah: ${voidError.message}. Cek transaksi & Mutasi.`,
      };
    }

    await syncLinkedInvoiceTotals([id]);

    return {
      success: true,
      message: `Transaksi ${existing.transaction_number} berhasil dibatalkan`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Terjadi kesalahan",
    };
  }
}

export async function addPayment(
  formData: PaymentFormValues
): Promise<ActionState<{ id: string }>> {
  try {
    const parsed = paymentSchema.safeParse(formData);
    if (!parsed.success) {
      return {
        success: false,
        message: parsed.error.issues[0]?.message || "Validasi gagal",
      };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, message: "Anda harus login" };
    }

    const transactionId = parsed.data.transaction_id;
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("id, status, final_price, payment_type, transaction_number")
      .eq("id", transactionId)
      .maybeSingle();

    if (txError) return { success: false, message: txError.message };
    if (!tx) return { success: false, message: "Transaksi tidak ditemukan" };
    if (tx.status === "LUNAS") {
      return {
        success: false,
        message: "Transaksi sudah lunas, tidak perlu pelunasan",
      };
    }
    if (tx.status === "BATAL") {
      return { success: false, message: "Transaksi sudah dibatalkan" };
    }

    const { data: existingPayments } = await supabase
      .from("transaction_payments")
      .select("amount")
      .eq("transaction_id", transactionId);

    const totalPaidBefore = (existingPayments || []).reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );
    const remainingBefore = Number(tx.final_price) - totalPaidBefore;
    const amount = toRupiahInteger(parsed.data.amount);

    if (amount > remainingBefore) {
      return {
        success: false,
        message: `Jumlah pembayaran melebihi sisa tagihan (Rp ${remainingBefore.toLocaleString("id-ID")})`,
      };
    }

    const { data: payment, error: payError } = await supabase
      .from("transaction_payments")
      .insert({
        transaction_id: transactionId,
        amount,
        method: parsed.data.method,
        note: parsed.data.note || null,
        created_by: user.id,
      })
      .select("id")
      .maybeSingle();

    if (payError) return { success: false, message: payError.message };
    if (!payment) {
      return { success: false, message: "Gagal menambahkan pembayaran" };
    }

    const totalPaidAfter = totalPaidBefore + amount;
    const remainingAfter = Number(tx.final_price) - totalPaidAfter;

    let newStatus = tx.status as string;
    if (remainingAfter <= 0) newStatus = "LUNAS";
    else if (tx.status === "DP" && totalPaidAfter > 0) {
      newStatus = "MENUNGGU_PELUNASAN";
    }

    if (newStatus !== tx.status) {
      await supabase
        .from("transactions")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", transactionId);
    }

    const statusMsg = newStatus === "LUNAS" ? " — LUNAS" : "";
    return {
      success: true,
      message: `Pembayaran Rp ${amount.toLocaleString("id-ID")} berhasil dicatat${statusMsg}`,
      data: { id: payment.id },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menambah pembayaran",
    };
  }
}
