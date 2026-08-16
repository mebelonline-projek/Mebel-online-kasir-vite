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
import {
  totalTagihan,
} from "@/lib/customer-charges";
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

export interface TransactionCustomerCharge {
  id: string;
  name: string;
  amount: number;
  sort_order: number;
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
  transaction_customer_charges: TransactionCustomerCharge[];
  transaction_payments: TransactionPaymentRow[];
  hpp_items: TransactionHppItem[];
}

async function fetchChargesTotalByTxIds(
  txIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (txIds.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < txIds.length; i += chunkSize) {
    const chunk = txIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from("transaction_customer_charges")
      .select("transaction_id, amount")
      .in("transaction_id", chunk);
    for (const row of data || []) {
      map.set(
        row.transaction_id,
        (map.get(row.transaction_id) || 0) + Number(row.amount || 0)
      );
    }
  }
  return map;
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

/** Alokasi final_price baru ke baris item (qty/produk tetap). */
export function allocateLineTotalsToFinalPrice(
  items: Array<{ id: string; quantity: number; line_total: number }>,
  finalPrice: number
): Array<{ id: string; unit_price: number; line_total: number }> {
  if (items.length === 0) return [];
  const target = toRupiahInteger(finalPrice);
  const qtyOf = (n: number) => Math.max(1, Math.round(Number(n) || 1));

  if (items.length === 1) {
    const q = qtyOf(items[0].quantity);
    const line_total = target;
    const unit_price = q === 1 ? line_total : Math.max(1, Math.floor(line_total / q));
    return [{ id: items[0].id, unit_price, line_total }];
  }

  const oldSum = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
  const allocated: Array<{ id: string; unit_price: number; line_total: number }> =
    [];
  let used = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const q = qtyOf(item.quantity);
    let line_total: number;
    if (i === items.length - 1) {
      line_total = Math.max(0, target - used);
    } else if (oldSum > 0) {
      line_total = Math.floor(
        (target * (Number(item.line_total) || 0)) / oldSum
      );
      used += line_total;
    } else {
      line_total = Math.floor(target / items.length);
      used += line_total;
    }
    const unit_price =
      line_total <= 0 ? 0 : q === 1 ? line_total : Math.max(1, Math.floor(line_total / q));
    allocated.push({ id: item.id, unit_price, line_total });
  }

  return allocated;
}

async function syncTransactionItemPrices(
  transactionId: string,
  finalPrice: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: items, error } = await supabase
    .from("transaction_items")
    .select("id, quantity, line_total, sort_order")
    .eq("transaction_id", transactionId)
    .order("sort_order", { ascending: true });

  if (error) {
    return { ok: false, message: `Gagal baca item: ${error.message}` };
  }
  if (!items || items.length === 0) return { ok: true };

  const oldSum = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
  if (oldSum === finalPrice) return { ok: true };

  const patches = allocateLineTotalsToFinalPrice(
    items.map((i) => ({
      id: i.id as string,
      quantity: Number(i.quantity) || 1,
      line_total: Number(i.line_total) || 0,
    })),
    finalPrice
  );

  for (const patch of patches) {
    const { data: updated, error: updError } = await supabase
      .from("transaction_items")
      .update({
        unit_price: patch.unit_price,
        line_total: patch.line_total,
      })
      .eq("id", patch.id)
      .select("id");
    if (updError) {
      return {
        ok: false,
        message: `Gagal sync harga item: ${updError.message}`,
      };
    }
    if (!updated || updated.length === 0) {
      return {
        ok: false,
        message:
          "Gagal sync harga item: tidak diizinkan mengubah baris pesanan (RLS). Coba sebagai Owner atau cek policy transaction_items.",
      };
    }
  }

  return { ok: true };
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

  const chargesByTx = await fetchChargesTotalByTxIds(allTxIds);
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
        (sum, tid) =>
          sum +
          Number(txMap.get(tid)?.final_price || 0) +
          (chargesByTx.get(tid) || 0),
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
    const chargeRows = (data.customer_charges || [])
      .filter((c) => c.name.trim() && Number(c.amount) > 0)
      .map((c, index) => ({
        name: c.name.trim(),
        amount: toRupiahInteger(c.amount),
        sort_order: index,
      }));
    const dueTotal = totalTagihan(finalPrice, chargeRows);
    const isCash = data.payment_type === "CASH";
    const status = isCash ? "LUNAS" : "DP";
    const dpAmount = toRupiahInteger(isCash ? dueTotal : data.dp_amount);
    const userDescription = data.description?.trim() || null;
    const description =
      userDescription ||
      (data.items && data.items.length > 0
        ? data.items.map((i) => i.product_name).join(", ")
        : null);
    const firstProductId =
      data.items && data.items.length > 0 && data.items[0].product_id
        ? data.items[0].product_id
        : data.product_id && data.product_id.length > 0
          ? data.product_id
          : null;

    if (data.payment_type === "DP" && data.dp_amount >= dueTotal) {
      return {
        success: false,
        message: "DP harus kurang dari total tagihan",
      };
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

      // Auto-seed HPP dari harga modal produk (opsional; gagal tidak batalkan jual)
      const catalogProductIds = [
        ...new Set(
          rows
            .map((r) => r.product_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (catalogProductIds.length > 0) {
        const { data: costRows } = await supabase
          .from("products")
          .select("id, cost_price")
          .in("id", catalogProductIds);

        const costById = new Map(
          (costRows || []).map((p) => [
            p.id as string,
            Number(p.cost_price ?? 0),
          ])
        );

        const hppRows = rows
          .filter((r) => r.product_id && (costById.get(r.product_id) ?? 0) > 0)
          .map((r) => {
            const unitCost = costById.get(r.product_id!) ?? 0;
            return {
              transaction_id: transaction.id,
              name: r.product_name,
              amount: toRupiahInteger(r.quantity) * toRupiahInteger(unitCost),
              note: null as string | null,
              created_by: user.id,
            };
          })
          .filter((h) => h.amount > 0);

        if (hppRows.length > 0) {
          const { error: hppError } = await supabase
            .from("hpp_items")
            .insert(hppRows);
          if (hppError) {
            console.warn(
              "Gagal auto-isi HPP dari harga modal:",
              hppError.message
            );
          }
        }
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

    if (chargeRows.length > 0) {
      const { error: chargesError } = await supabase
        .from("transaction_customer_charges")
        .insert(
          chargeRows.map((c) => ({
            transaction_id: transaction.id,
            name: c.name,
            amount: c.amount,
            sort_order: c.sort_order,
          }))
        );
      if (chargesError) {
        await supabase.from("transactions").delete().eq("id", transaction.id);
        return {
          success: false,
          message: `Gagal menyimpan biaya pembeli: ${chargesError.message}`,
        };
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

const LIST_SELECT =
  "id, transaction_number, customer_name, description, final_price, payment_type, dp_amount, status, fulfillment_status, created_at, client_id";

/** Strip metachar PostgREST dari kata kunci user. */
function sanitizeSearchQuery(q: string): string {
  return q.replace(/[%_,.()\\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * List transaksi dengan optional search (seluruh DB via ilike) + filter status.
 * Search membatasi jumlah hasil (limit), bukan membatasi ruang pencarian ke 50 terbaru.
 */
export async function listTransactionsQuery(params: {
  q?: string;
  statuses?: string[] | null;
  limit?: number;
} = {}): Promise<ActionState<TransactionRow[]>> {
  try {
    const limit = params.limit ?? 50;
    const statuses = params.statuses ?? null;
    const safeQ = params.q ? sanitizeSearchQuery(params.q) : "";

    let query = supabase
      .from("transactions")
      .select(LIST_SELECT)
      .order("created_at", { ascending: false })
      .order("transaction_number", { ascending: false })
      .limit(limit);

    if (statuses && statuses.length === 1) {
      query = query.eq("status", statuses[0]);
    } else if (statuses && statuses.length > 1) {
      query = query.in("status", statuses);
    }

    if (safeQ) {
      query = query.or(
        `transaction_number.ilike.%${safeQ}%,customer_name.ilike.%${safeQ}%,description.ilike.%${safeQ}%`
      );
    }

    const { data, error } = await query;
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

export async function listRecentTransactions(
  limit = 30
): Promise<ActionState<TransactionRow[]>> {
  return listTransactionsQuery({ limit });
}

/** List by status (untuk filter chip) — bukan window “semua status”. */
export async function listTransactionsByStatuses(
  statuses: string[],
  limit = 50
): Promise<ActionState<TransactionRow[]>> {
  return listTransactionsQuery({ statuses, limit });
}

/** client_id pending yang sudah ada di server (hindari double-count stats). */
export async function findExistingClientIds(
  clientIds: string[]
): Promise<Set<string>> {
  const unique = [...new Set(clientIds.filter(Boolean))];
  if (unique.length === 0) return new Set();
  try {
    const { data, error } = await supabase
      .from("transactions")
      .select("client_id")
      .in("client_id", unique);
    if (error || !data) return new Set();
    return new Set(
      data.map((r) => r.client_id).filter((id): id is string => Boolean(id))
    );
  } catch {
    return new Set();
  }
}

/** Count penuh untuk kartu Total/Lunas/Belum Lunas/Batal (bukan window list). */
export interface TransactionListStats {
  total: number;
  lunas: number;
  menunggu: number;
  batal: number;
}

export async function getTransactionStatusCounts(): Promise<
  ActionState<TransactionListStats>
> {
  try {
    const [totalRes, lunasRes, batalRes] = await Promise.all([
      supabase.from("transactions").select("id", { count: "exact", head: true }),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "LUNAS"),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "BATAL"),
    ]);

    const firstError =
      totalRes.error || lunasRes.error || batalRes.error;
    if (firstError) {
      return { success: false, message: firstError.message };
    }

    const total = totalRes.count ?? 0;
    const lunas = lunasRes.count ?? 0;
    const batal = batalRes.count ?? 0;
    const menunggu = Math.max(0, total - lunas - batal);

    return { success: true, data: { total, lunas, menunggu, batal } };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal menghitung transaksi",
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
        transaction_customer_charges ( id, name, amount, sort_order ),
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

    const charges = (
      (data.transaction_customer_charges as
        | TransactionCustomerCharge[]
        | null) || []
    )
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((c) => ({
        ...c,
        amount: Number(c.amount),
      }));

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
        transaction_customer_charges: charges,
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

    if (existing.status === "BATAL") {
      return {
        success: false,
        message: "Transaksi batal tidak bisa diedit",
      };
    }

    if (existing.status === "MENUNGGU_PELUNASAN") {
      return {
        success: false,
        message:
          "Transaksi sudah ada pelunasan, tidak bisa diedit. Batalkan dulu jika perlu koreksi.",
      };
    }

    if (existing.status !== "DP" && existing.status !== "LUNAS") {
      return {
        success: false,
        message: "Status transaksi tidak bisa diedit",
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
    const chargeRows = (data.customer_charges || [])
      .filter((c) => c.name.trim() && Number(c.amount) > 0)
      .map((c, index) => ({
        name: c.name.trim(),
        amount: toRupiahInteger(c.amount),
        sort_order: index,
      }));
    const dueTotal = totalTagihan(finalPrice, chargeRows);
    const dpAmount = toRupiahInteger(isCash ? dueTotal : data.dp_amount);
    const newStatus = isCash ? "LUNAS" : "DP";
    const businessTimestamp =
      data.transaction_date && data.transaction_date.length > 0
        ? wibNoonISO(data.transaction_date)
        : null;

    if (!isCash && data.dp_amount >= dueTotal) {
      return {
        success: false,
        message: "DP harus kurang dari total tagihan",
      };
    }

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
        ...(businessTimestamp ? { created_at: businessTimestamp } : {}),
      })
      .eq("id", id);

    if (updateError) return { success: false, message: updateError.message };

    const itemSync = await syncTransactionItemPrices(id, finalPrice);
    if (!itemSync.ok) {
      return { success: false, message: itemSync.message };
    }

    await supabase
      .from("transaction_customer_charges")
      .delete()
      .eq("transaction_id", id);

    if (chargeRows.length > 0) {
      const { error: chargesError } = await supabase
        .from("transaction_customer_charges")
        .insert(
          chargeRows.map((c) => ({
            transaction_id: id,
            name: c.name,
            amount: c.amount,
            sort_order: c.sort_order,
          }))
        );
      if (chargesError) {
        return {
          success: false,
          message: `Gagal menyimpan biaya pembeli: ${chargesError.message}`,
        };
      }
    }

    const paymentAmount = dpAmount;
    const existingPaymentsList = existingPayments || [];
    const paymentPatch = {
      amount: paymentAmount,
      note: isCash ? "Pembayaran Lunas (edit)" : "Uang Muka (DP) — edit",
      ...(businessTimestamp ? { payment_date: businessTimestamp } : {}),
    };

    if (existingPaymentsList.length > 0) {
      const { error: payError } = await supabase
        .from("transaction_payments")
        .update(paymentPatch)
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
          ...(businessTimestamp ? { payment_date: businessTimestamp } : {}),
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

    const { data: chargeRows } = await supabase
      .from("transaction_customer_charges")
      .select("amount")
      .eq("transaction_id", transactionId);

    const dueTotal = totalTagihan(Number(tx.final_price), chargeRows || []);
    const totalPaidBefore = (existingPayments || []).reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );
    const remainingBefore = dueTotal - totalPaidBefore;
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
    const remainingAfter = dueTotal - totalPaidAfter;

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

    await syncLinkedInvoiceTotals([transactionId]);

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
