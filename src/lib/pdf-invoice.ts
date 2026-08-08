import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InvoiceData,
  InvoiceLineItem,
} from "@/components/invoice/invoice-document";
import { DEFAULT_LOGO } from "@/lib/store-logo";
import { supabase } from "@/lib/supabase";

function formatIdDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function resolveLogoUrl(settingsLogo: string | null | undefined): string | null {
  if (settingsLogo) return settingsLogo;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${DEFAULT_LOGO}`;
  }
  return DEFAULT_LOGO;
}

export function mapTransactionLineItems(
  items:
    | Array<{
        product_name: string;
        quantity: number;
        unit_price: number;
        line_total: number;
        note: string | null;
        sort_order: number;
      }>
    | null
    | undefined,
  fallback: { description: string | null; final_price: number }
): InvoiceLineItem[] {
  if (items && items.length > 0) {
    return [...items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        note: item.note,
      }));
  }

  return [
    {
      product_name: fallback.description || "Pesanan",
      quantity: 1,
      unit_price: fallback.final_price,
      line_total: fallback.final_price,
      note: null,
    },
  ];
}

/**
 * Catatan nota: hanya deskripsi user, bukan ringkasan auto nama barang
 * (supaya tidak dobel dengan baris produk).
 */
export function resolveNotaCatatan(
  description: string | null | undefined,
  lineItems: Array<{ product_name: string }>
): string | null {
  const text = description?.trim() || "";
  if (!text) return null;
  if (lineItems.length === 0) return null;
  const autoSummary = lineItems.map((i) => i.product_name).join(", ");
  if (text === autoSummary) return null;
  return text;
}

export async function buildNotaPdfData(
  transactionId: string,
  client: SupabaseClient = supabase
): Promise<InvoiceData | null> {
  const { data: transaction, error } = await client
    .from("transactions")
    .select(
      `
      *,
      transaction_payments (*),
      transaction_items (*),
      transaction_customer_charges ( name, amount, sort_order )
    `
    )
    .eq("id", transactionId)
    .maybeSingle();

  if (error || !transaction) return null;

  const { data: settings } = await client
    .from("store_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  const payments = (transaction.transaction_payments || []) as Array<{
    amount: number;
    payment_date: string;
    method: string;
    note: string | null;
  }>;

  const customerCharges = (
    (transaction.transaction_customer_charges || []) as Array<{
      name: string;
      amount: number;
      sort_order: number;
    }>
  )
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((c) => ({
      name: c.name,
      amount: Number(c.amount),
    }));

  const goodsPrice = Number(transaction.final_price);
  const chargesTotal = customerCharges.reduce((s, c) => s + c.amount, 0);
  const totalDue = goodsPrice + chargesTotal;
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remainingAmount = totalDue - totalPaid;
  const lineItems = mapTransactionLineItems(
    transaction.transaction_items as Array<{
      product_name: string;
      quantity: number;
      unit_price: number;
      line_total: number;
      note: string | null;
      sort_order: number;
    }> | null,
    {
      description: transaction.description,
      final_price: goodsPrice,
    }
  );

  return {
    invoiceNumber: transaction.transaction_number,
    createdAt: formatIdDate(transaction.created_at),
    status: transaction.status,
    storeName: settings?.store_name || "Mebel Online Monitoring",
    storeAddress: settings?.address || null,
    storePhone: settings?.phone || null,
    storeLogoUrl: resolveLogoUrl(settings?.logo_url),
    customerName: transaction.customer_name || "—",
    customerPhone: null,
    customerAddress: null,
    productName: lineItems.map((i) => i.product_name).join(", "),
    productDescription: null,
    description: resolveNotaCatatan(
      transaction.description,
      lineItems
    ),
    lineItems,
    customerCharges,
    finalPrice: goodsPrice,
    totalDue,
    paymentType: transaction.payment_type,
    dpAmount: Number(transaction.dp_amount || 0),
    totalPaid,
    remainingAmount,
    payments: payments.map((p) => ({
      amount: Number(p.amount),
      date: formatIdDate(p.payment_date),
      method: p.method,
      note: p.note,
    })),
  };
}

export async function buildFakturPdfData(
  invoiceId: string,
  client: SupabaseClient = supabase
): Promise<InvoiceData | null> {
  const { data: invoice, error } = await client
    .from("invoices")
    .select(
      `
      *,
      invoice_items (
        transaction_id,
        transactions:transaction_id (
          id,
          transaction_number,
          description,
          final_price,
          status,
          transaction_payments (*)
        )
      )
    `
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error || !invoice) return null;

  const { data: settings } = await client
    .from("store_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  type TxRow = {
    transaction_number: string;
    description: string | null;
    final_price: number;
    transaction_payments?: Array<{
      amount: number;
      payment_date: string;
      method: string;
      note: string | null;
    }>;
  };

  const items = (invoice.invoice_items || []) as Array<{
    transactions: TxRow | null;
  }>;

  const transactions = items
    .map((i) => i.transactions)
    .filter(Boolean) as TxRow[];
  const lineSummary = transactions
    .map(
      (t) =>
        `${t.transaction_number}${t.description ? ` — ${t.description}` : ""}`
    )
    .join("; ");

  const allPayments = transactions.flatMap(
    (t) => t.transaction_payments || []
  );

  const lineItems: InvoiceLineItem[] = transactions.map((t) => ({
    product_name: `${t.transaction_number}${
      t.description ? ` — ${t.description}` : ""
    }`,
    quantity: 1,
    unit_price: t.final_price,
    line_total: t.final_price,
    note: null,
  }));

  return {
    invoiceNumber: invoice.invoice_number,
    createdAt: formatIdDate(invoice.created_at),
    status: invoice.status,
    storeName: settings?.store_name || "Mebel Online Monitoring",
    storeAddress: settings?.address || null,
    storePhone: settings?.phone || null,
    storeLogoUrl: resolveLogoUrl(settings?.logo_url),
    customerName: invoice.customer_name || "—",
    customerPhone: null,
    customerAddress: null,
    productName:
      transactions.length > 1
        ? `Paket ${transactions.length} transaksi`
        : transactions[0]?.description ||
          transactions[0]?.transaction_number ||
          "—",
    productDescription: lineSummary || null,
    description: invoice.notes || null,
    lineItems:
      lineItems.length > 0
        ? lineItems
        : mapTransactionLineItems(null, {
            description: invoice.notes,
            final_price: invoice.total_amount,
          }),
    finalPrice: invoice.total_amount,
    paymentType: invoice.remaining_amount <= 0 ? "CASH" : "DP",
    dpAmount: invoice.total_paid,
    totalPaid: invoice.total_paid,
    remainingAmount: invoice.remaining_amount,
    payments: allPayments.map((p) => ({
      amount: p.amount,
      date: formatIdDate(p.payment_date),
      method: p.method,
      note: p.note,
    })),
  };
}
