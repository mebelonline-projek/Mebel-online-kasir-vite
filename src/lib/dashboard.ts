import { supabase } from "@/lib/supabase";
import { sumGoodsRevenueInRange } from "@/lib/customer-charges";
import {
  addWibDays,
  getWibDateString,
  getWibDayLabel,
  getWibMonthEnd,
  getWibPeriodBounds,
  parseWibDate,
  wibEndISO,
  wibStartISO,
  wibToDate,
  type PeriodType,
} from "@/lib/date-utils";

export type { PeriodType };

export interface DashboardMonthlyData {
  month: string;
  monthLabel: string;
  revenue: number;
  hpp: number;
  grossProfit: number;
  operationalCosts: number;
  netProfit: number;
  txCount: number;
}

/** Tren KPI — arah dari selisih absolut; % di-cap / dikosongkan jika tak bermakna */
export interface DashboardTrend {
  direction: "up" | "down" | "flat";
  /** Nilai absolut untuk ditampilkan; null jika mode khusus tanpa % */
  percent: number | null;
  mode: "percent" | "from_loss" | "from_zero" | "to_loss" | "flat";
  /** true jika % sudah di-cap di 999 */
  capped?: boolean;
}

export interface DashboardStats {
  revenue: number;
  hpp: number;
  grossProfit: number;
  operationalCosts: number;
  netProfit: number;
  netMargin: number;
  txCount: number;
  prevRevenue: number;
  prevGrossProfit: number;
  prevNetProfit: number;
  prevNetMargin: number;
  revenueTrend: DashboardTrend;
  grossProfitTrend: DashboardTrend;
  netProfitTrend: DashboardTrend;
  netMarginTrend: DashboardTrend;
  monthlyData: DashboardMonthlyData[];
  recentTransactions: Array<{
    id: string;
    transaction_number: string;
    final_price: number;
    status: string;
    created_at: string;
    customer_name: string;
  }>;
}

type PaymentRow = {
  amount: number;
  transaction_id: string;
  payment_date: string;
  transactions: unknown;
};

type TxRow = { id: string; status: string; created_at: string; final_price?: number };
type OpCostRow = { amount: number; period_start: string; period_end: string };

function fmtDateISO(d: Date): string {
  return d.toISOString();
}

function fmtDateOnly(d: Date): string {
  return getWibDateString(d);
}

/** PostgREST default max 1000 rows — WAJIB paginate. */
async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchChartRawData(chartStart: Date, chartEnd: Date) {
  const startIso = fmtDateISO(chartStart);
  const endIso = fmtDateISO(chartEnd);
  const chartEndDate = fmtDateOnly(chartEnd);
  const chartStartDate = fmtDateOnly(chartStart);

  const [allPayments, allTx, allOpCosts] = await Promise.all([
    fetchAllRows<PaymentRow>(async (from, to) =>
      supabase
        .from("transaction_payments")
        .select("amount, transaction_id, payment_date, transactions!inner(status)")
        .gte("payment_date", startIso)
        .lte("payment_date", endIso)
        .order("payment_date", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TxRow>(async (from, to) =>
      supabase
        .from("transactions")
        .select("id, status, created_at, final_price")
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<OpCostRow>(async (from, to) =>
      supabase
        .from("operational_costs")
        .select("amount, period_start, period_end")
        .lte("period_start", chartEndDate)
        .gte("period_end", chartStartDate)
        .order("period_start", { ascending: true })
        .range(from, to)
    ),
  ]);

  // Transaksi yang hanya muncul lewat pembayaran (dibuat di luar rentang chart)
  const knownTxIds = new Set(allTx.map((t) => t.id));
  const missingPaymentTxIds = [
    ...new Set(
      allPayments
        .map((p) => p.transaction_id)
        .filter((id) => id && !knownTxIds.has(id))
    ),
  ];
  const extraTx: Array<{ id: string; status: string; created_at: string; final_price: number }> = [];
  const chunkSize = 200;
  for (let i = 0; i < missingPaymentTxIds.length; i += chunkSize) {
    const chunk = missingPaymentTxIds.slice(i, i + chunkSize);
    const rows = await fetchAllRows<{
      id: string;
      status: string;
      created_at: string;
      final_price: number;
    }>(async (from, to) =>
      supabase
        .from("transactions")
        .select("id, status, created_at, final_price")
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)
    );
    extraTx.push(...rows);
  }

  const txMeta = [...allTx, ...extraTx];
  const finalPriceByTx = new Map<string, number>();
  for (const t of txMeta) {
    finalPriceByTx.set(t.id, Number(t.final_price) || 0);
  }

  const hppTxIds = [
    ...new Set([
      ...allTx.filter((t) => t.status !== "BATAL").map((t) => t.id),
      ...extraTx.filter((t) => t.status !== "BATAL").map((t) => t.id),
      ...allPayments.map((p) => p.transaction_id),
    ]),
  ];

  const allHpp: Array<{ amount: number; transaction_id: string }> = [];
  for (let i = 0; i < hppTxIds.length; i += chunkSize) {
    const chunk = hppTxIds.slice(i, i + chunkSize);
    const chunkRows = await fetchAllRows<{ amount: number; transaction_id: string }>(
      async (from, to) =>
        supabase
          .from("hpp_items")
          .select("amount, transaction_id")
          .in("transaction_id", chunk)
          .order("transaction_id", { ascending: true })
          .range(from, to)
    );
    allHpp.push(...chunkRows);
  }

  const hppByTx = new Map<string, number>();
  for (const h of allHpp) {
    hppByTx.set(h.transaction_id, (hppByTx.get(h.transaction_id) || 0) + (h.amount || 0));
  }

  const chargeTxIds = [
    ...new Set([
      ...allTx.map((t) => t.id),
      ...extraTx.map((t) => t.id),
      ...allPayments.map((p) => p.transaction_id),
    ]),
  ];
  const chargesByTx = new Map<string, number>();
  for (let i = 0; i < chargeTxIds.length; i += chunkSize) {
    const chunk = chargeTxIds.slice(i, i + chunkSize);
    const rows = await fetchAllRows<{ amount: number; transaction_id: string }>(
      async (from, to) =>
        supabase
          .from("transaction_customer_charges")
          .select("amount, transaction_id")
          .in("transaction_id", chunk)
          .order("transaction_id", { ascending: true })
          .range(from, to)
    );
    for (const row of rows) {
      chargesByTx.set(
        row.transaction_id,
        (chargesByTx.get(row.transaction_id) || 0) + (row.amount || 0)
      );
    }
  }

  // Riwayat bayar penuh per trx (untuk alokasi barang-dulu vs ongkir)
  const paymentHistoryByTx = new Map<
    string,
    Array<{ amount: number; payment_date: string }>
  >();
  const txsNeedingHistory = [
    ...new Set(
      allPayments
        .map((p) => p.transaction_id)
        .filter((id) => (chargesByTx.get(id) || 0) > 0)
    ),
  ];
  for (let i = 0; i < txsNeedingHistory.length; i += chunkSize) {
    const chunk = txsNeedingHistory.slice(i, i + chunkSize);
    const rows = await fetchAllRows<{
      amount: number;
      transaction_id: string;
      payment_date: string;
    }>(async (from, to) =>
      supabase
        .from("transaction_payments")
        .select("amount, transaction_id, payment_date")
        .in("transaction_id", chunk)
        .order("payment_date", { ascending: true })
        .range(from, to)
    );
    for (const row of rows) {
      const list = paymentHistoryByTx.get(row.transaction_id) || [];
      list.push({
        amount: Number(row.amount) || 0,
        payment_date: row.payment_date,
      });
      paymentHistoryByTx.set(row.transaction_id, list);
    }
  }

  return {
    allPayments,
    allTx,
    allOpCosts,
    finalPriceByTx,
    hppByTx,
    chargesByTx,
    paymentHistoryByTx,
  };
}

function paymentTxStatus(transactions: unknown): string | undefined {
  const tx = transactions;
  if (Array.isArray(tx)) {
    return (tx[0] as { status: string } | undefined)?.status;
  }
  return (tx as { status: string } | null)?.status;
}

function aggregatePaymentsInRange(
  payments: PaymentRow[],
  rangeStart: Date,
  rangeEnd: Date,
  finalPriceByTx: Map<string, number>,
  chargesByTx: Map<string, number>,
  paymentHistoryByTx: Map<string, Array<{ amount: number; payment_date: string }>>
): { revenue: number; paidByTx: Map<string, number> } {
  const rStart = rangeStart.getTime();
  const rEnd = rangeEnd.getTime();
  const paidByTx = new Map<string, number>();
  let revenue = 0;

  const txIdsInRange = new Set<string>();
  for (const p of payments) {
    const d = new Date(p.payment_date).getTime();
    if (d < rStart || d > rEnd) continue;
    if (paymentTxStatus(p.transactions) === "BATAL") continue;
    txIdsInRange.add(p.transaction_id);
  }

  for (const txId of txIdsInRange) {
    const charges = chargesByTx.get(txId) || 0;
    const finalPrice = finalPriceByTx.get(txId) || 0;

    if (charges <= 0) {
      let goods = 0;
      for (const p of payments) {
        if (p.transaction_id !== txId) continue;
        const d = new Date(p.payment_date).getTime();
        if (d < rStart || d > rEnd) continue;
        if (paymentTxStatus(p.transactions) === "BATAL") continue;
        goods += p.amount || 0;
      }
      revenue += goods;
      paidByTx.set(txId, goods);
      continue;
    }

    const history =
      paymentHistoryByTx.get(txId) ||
      payments
        .filter((p) => p.transaction_id === txId)
        .map((p) => ({
          amount: Number(p.amount) || 0,
          payment_date: p.payment_date,
        }))
        .sort((a, b) =>
          a.payment_date < b.payment_date
            ? -1
            : a.payment_date > b.payment_date
              ? 1
              : 0
        );

    const { goodsInRange } = sumGoodsRevenueInRange(
      history,
      finalPrice,
      rStart,
      rEnd
    );
    revenue += goodsInRange;
    paidByTx.set(txId, goodsInRange);
  }

  return { revenue, paidByTx };
}

/** HPP dialokasikan proporsional: (bayar periode / harga final) × total HPP transaksi */
function sumProportionalHpp(
  paidByTx: Map<string, number>,
  hppByTx: Map<string, number>,
  finalPriceByTx: Map<string, number>
): number {
  let total = 0;
  for (const [txId, paid] of paidByTx) {
    if (paid <= 0) continue;
    const finalPrice = finalPriceByTx.get(txId) || 0;
    const hpp = hppByTx.get(txId) || 0;
    if (finalPrice <= 0 || hpp === 0) continue;
    const ratio = Math.min(paid / finalPrice, 1);
    total += hpp * ratio;
  }
  return Math.round(total);
}

function aggregateOpCostsInRange(
  opCosts: OpCostRow[],
  rangeStart: Date,
  rangeEnd: Date
): number {
  const rStart = rangeStart.getTime();
  const rEnd = rangeEnd.getTime();
  return opCosts
    .filter((op) => {
      const ps = new Date(op.period_start).getTime();
      const pe = new Date(op.period_end).getTime();
      return ps <= rEnd && pe >= rStart;
    })
    .reduce((s, op) => s + (op.amount || 0), 0);
}

function countTxInRange(
  allTx: TxRow[],
  rangeStart: Date,
  rangeEnd: Date
): number {
  const rStart = rangeStart.getTime();
  const rEnd = rangeEnd.getTime();
  return allTx.filter((t) => {
    if (t.status === "BATAL") return false;
    const d = new Date(t.created_at).getTime();
    return d >= rStart && d <= rEnd;
  }).length;
}

interface PeriodStat {
  revenue: number;
  hpp: number;
  grossProfit: number;
  operationalCosts: number;
  netProfit: number;
  netMargin: number;
  txCount: number;
}

function computePeriodStat(
  payments: PaymentRow[],
  opCosts: OpCostRow[],
  allTx: TxRow[],
  hppByTx: Map<string, number>,
  finalPriceByTx: Map<string, number>,
  chargesByTx: Map<string, number>,
  paymentHistoryByTx: Map<string, Array<{ amount: number; payment_date: string }>>,
  rangeStart: Date,
  rangeEnd: Date
): PeriodStat {
  const { revenue, paidByTx } = aggregatePaymentsInRange(
    payments,
    rangeStart,
    rangeEnd,
    finalPriceByTx,
    chargesByTx,
    paymentHistoryByTx
  );
  const hpp = sumProportionalHpp(paidByTx, hppByTx, finalPriceByTx);
  const grossProfit = revenue - hpp;
  const operationalCosts = aggregateOpCostsInRange(opCosts, rangeStart, rangeEnd);
  const netProfit = grossProfit - operationalCosts;
  const netMargin = revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0;
  const txCount = countTxInRange(allTx, rangeStart, rangeEnd);
  return { revenue, hpp, grossProfit, operationalCosts, netProfit, netMargin, txCount };
}

const TREND_PERCENT_CAP = 999;

/** Hitung tren dengan arah dari selisih absolut; hindari % gila saat basis ≤ 0 */
function calcDashboardTrend(curr: number, prevVal: number): DashboardTrend {
  const delta = curr - prevVal;
  if (delta === 0) {
    return { direction: "flat", percent: null, mode: "flat" };
  }

  const direction: "up" | "down" = delta > 0 ? "up" : "down";

  if (prevVal === 0) {
    return {
      direction,
      percent: null,
      mode: curr > 0 ? "from_zero" : "to_loss",
    };
  }

  // Rugi → untung/nol: % relatif tidak bermakna
  if (prevVal < 0 && curr >= 0) {
    return { direction: "up", percent: null, mode: "from_loss" };
  }

  // Untung → rugi: tetap tampilkan % (berguna), arah turun
  if (prevVal > 0 && curr < 0) {
    const raw = Math.abs((delta / prevVal) * 100);
    const capped = raw > TREND_PERCENT_CAP;
    return {
      direction: "down",
      percent: Math.round((capped ? TREND_PERCENT_CAP : raw) * 10) / 10,
      mode: "to_loss",
      capped: capped || undefined,
    };
  }

  const raw = Math.abs((delta / Math.abs(prevVal)) * 100);
  const capped = raw > TREND_PERCENT_CAP;
  return {
    direction,
    percent: Math.round((capped ? TREND_PERCENT_CAP : raw) * 10) / 10,
    mode: "percent",
    capped: capped || undefined,
  };
}

function calcMarginTrend(curr: number, prevVal: number): DashboardTrend {
  const delta = Math.round((curr - prevVal) * 10) / 10;
  if (delta === 0) return { direction: "flat", percent: null, mode: "flat" };
  return {
    direction: delta > 0 ? "up" : "down",
    percent: Math.abs(delta),
    mode: "percent",
  };
}

async function computeDashboardStats(period: PeriodType): Promise<DashboardStats> {
  const today = getWibDateString();
  const { kpiStart, kpiEnd, prevStart, prevEnd, chartStart, chartEnd } =
    getWibPeriodBounds(period);
  const {
    allPayments,
    allTx,
    allOpCosts,
    finalPriceByTx,
    hppByTx,
    chargesByTx,
    paymentHistoryByTx,
  } = await fetchChartRawData(chartStart, chartEnd);

  const periodStat = (rangeStart: Date, rangeEnd: Date) =>
    computePeriodStat(
      allPayments,
      allOpCosts,
      allTx,
      hppByTx,
      finalPriceByTx,
      chargesByTx,
      paymentHistoryByTx,
      rangeStart,
      rangeEnd
    );

  const kpi = periodStat(kpiStart, kpiEnd);
  const prev = periodStat(prevStart, prevEnd);

  const revenueTrend = calcDashboardTrend(kpi.revenue, prev.revenue);
  const grossProfitTrend = calcDashboardTrend(kpi.grossProfit, prev.grossProfit);
  const netProfitTrend = calcDashboardTrend(kpi.netProfit, prev.netProfit);
  const netMarginTrend =
    kpi.revenue > 0 || prev.revenue > 0
      ? calcMarginTrend(kpi.netMargin, prev.netMargin)
      : { direction: "flat" as const, percent: null, mode: "flat" as const };

  const monthlyData: DashboardMonthlyData[] = [];
  const monthLabels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];

  if (period === "daily") {
    for (let d = 29; d >= 0; d--) {
      const dateStr = addWibDays(today, -d);
      const s = wibToDate(wibStartISO(dateStr));
      const e = wibToDate(wibEndISO(dateStr));
      const stat = periodStat(s, e);
      const { day, month } = parseWibDate(dateStr);
      monthlyData.push({
        month: dateStr,
        monthLabel: `${getWibDayLabel(dateStr)} ${day}/${month}`,
        revenue: stat.revenue,
        hpp: stat.hpp,
        grossProfit: stat.grossProfit,
        operationalCosts: stat.operationalCosts,
        netProfit: stat.netProfit,
        txCount: stat.txCount,
      });
    }
  } else if (period === "weekly") {
    const monday = (() => {
      const bounds = getWibPeriodBounds("weekly");
      return getWibDateString(bounds.kpiStart);
    })();
    for (let w = 11; w >= 0; w--) {
      const weekStartStr = addWibDays(monday, -w * 7);
      const weekEndStr = addWibDays(weekStartStr, 6);
      const s = wibToDate(wibStartISO(weekStartStr));
      const e = wibToDate(wibEndISO(weekEndStr));
      const stat = periodStat(s, e);
      const ws = parseWibDate(weekStartStr);
      const we = parseWibDate(weekEndStr);
      monthlyData.push({
        month: `W${weekStartStr}`,
        monthLabel: `${ws.day}/${ws.month} - ${we.day}/${we.month}`,
        revenue: stat.revenue,
        hpp: stat.hpp,
        grossProfit: stat.grossProfit,
        operationalCosts: stat.operationalCosts,
        netProfit: stat.netProfit,
        txCount: stat.txCount,
      });
    }
  } else if (period === "monthly") {
    const { year, month } = parseWibDate(today);
    for (let m = 0; m < 12; m++) {
      let cy = year;
      let cm = month - 11 + m;
      while (cm <= 0) {
        cm += 12;
        cy -= 1;
      }
      const monthStartStr = `${cy}-${String(cm).padStart(2, "0")}-01`;
      const monthEndStr = getWibMonthEnd(monthStartStr);
      const s = wibToDate(wibStartISO(monthStartStr));
      const e = wibToDate(wibEndISO(monthEndStr));
      const stat = periodStat(s, e);
      monthlyData.push({
        month: `${cy}-${String(cm).padStart(2, "0")}`,
        monthLabel: `${monthLabels[cm - 1]} ${cy}`,
        revenue: stat.revenue,
        hpp: stat.hpp,
        grossProfit: stat.grossProfit,
        operationalCosts: stat.operationalCosts,
        netProfit: stat.netProfit,
        txCount: stat.txCount,
      });
    }
  } else {
    const currentYear = parseWibDate(today).year;
    for (let y = 4; y >= 0; y--) {
      const year = currentYear - y;
      const s = wibToDate(wibStartISO(`${year}-01-01`));
      const e = wibToDate(wibEndISO(`${year}-12-31`));
      const stat = periodStat(s, e);
      monthlyData.push({
        month: `${year}`,
        monthLabel: `${year}`,
        revenue: stat.revenue,
        hpp: stat.hpp,
        grossProfit: stat.grossProfit,
        operationalCosts: stat.operationalCosts,
        netProfit: stat.netProfit,
        txCount: stat.txCount,
      });
    }
  }

  const { data: recentTx } = await supabase
    .from("transactions")
    .select("id, transaction_number, customer_name, final_price, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return {
    revenue: kpi.revenue,
    hpp: kpi.hpp,
    grossProfit: kpi.grossProfit,
    operationalCosts: kpi.operationalCosts,
    netProfit: kpi.netProfit,
    netMargin: kpi.netMargin,
    txCount: kpi.txCount,
    prevRevenue: prev.revenue,
    prevGrossProfit: prev.grossProfit,
    prevNetProfit: prev.netProfit,
    prevNetMargin: prev.netMargin,
    revenueTrend,
    grossProfitTrend,
    netProfitTrend,
    netMarginTrend,
    monthlyData,
    recentTransactions: (recentTx || []).map((tx) => ({
      id: tx.id,
      transaction_number: tx.transaction_number,
      final_price: tx.final_price,
      status: tx.status,
      created_at: tx.created_at,
      customer_name: tx.customer_name || "—",
    })),
  };
}

/** Owner-only: anon + RLS (OWNER full access). */
export async function getDashboardStats(period: PeriodType): Promise<DashboardStats> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus login");

  const { data: profile, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile || profile.role !== "OWNER") {
    throw new Error("Hanya Owner yang bisa melihat dashboard");
  }

  return computeDashboardStats(period);
}
