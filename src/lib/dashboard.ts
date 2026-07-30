import { supabase } from "@/lib/supabase";
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
  revenueTrend: number;
  grossProfitTrend: number;
  netProfitTrend: number;
  netMarginTrend: number;
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

type TxRow = { id: string; status: string; created_at: string };
type HppRow = { amount: number; transaction_id: string };
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
        .select("id, status, created_at")
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

  const validTxIds = allTx.filter((t) => t.status !== "BATAL").map((t) => t.id);
  const allHpp: HppRow[] = [];
  const chunkSize = 200;
  for (let i = 0; i < validTxIds.length; i += chunkSize) {
    const chunk = validTxIds.slice(i, i + chunkSize);
    const chunkRows = await fetchAllRows<HppRow>(async (from, to) =>
      supabase
        .from("hpp_items")
        .select("amount, transaction_id")
        .in("transaction_id", chunk)
        .order("transaction_id", { ascending: true })
        .range(from, to)
    );
    allHpp.push(...chunkRows);
  }

  return { allPayments, allTx, allHpp, allOpCosts };
}

function aggregatePaymentsInRange(
  payments: PaymentRow[],
  rangeStart: Date,
  rangeEnd: Date
): { revenue: number; txIds: string[] } {
  const rStart = rangeStart.getTime();
  const rEnd = rangeEnd.getTime();
  const valid = payments.filter((p) => {
    const d = new Date(p.payment_date).getTime();
    if (d < rStart || d > rEnd) return false;
    const tx = p.transactions;
    const status = Array.isArray(tx)
      ? (tx[0] as { status: string } | undefined)?.status
      : (tx as { status: string } | null)?.status;
    return status !== "BATAL";
  });
  const revenue = valid.reduce((s, p) => s + (p.amount || 0), 0);
  const txIds = [...new Set(valid.map((p) => p.transaction_id))];
  return { revenue, txIds };
}

function sumHppForBatch(hppItems: HppRow[], txIds: Set<string>): number {
  return hppItems
    .filter((h) => txIds.has(h.transaction_id))
    .reduce((s, h) => s + (h.amount || 0), 0);
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
  hppItems: HppRow[],
  opCosts: OpCostRow[],
  allTx: TxRow[],
  rangeStart: Date,
  rangeEnd: Date
): PeriodStat {
  const { revenue, txIds } = aggregatePaymentsInRange(payments, rangeStart, rangeEnd);
  const txIdSet = new Set(txIds);
  const hpp = sumHppForBatch(hppItems, txIdSet);
  const grossProfit = revenue - hpp;
  const operationalCosts = aggregateOpCostsInRange(opCosts, rangeStart, rangeEnd);
  const netProfit = grossProfit - operationalCosts;
  const netMargin = revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0;
  const txCount = countTxInRange(allTx, rangeStart, rangeEnd);
  return { revenue, hpp, grossProfit, operationalCosts, netProfit, netMargin, txCount };
}

async function computeDashboardStats(period: PeriodType): Promise<DashboardStats> {
  const today = getWibDateString();
  const { kpiStart, kpiEnd, prevStart, prevEnd, chartStart, chartEnd } =
    getWibPeriodBounds(period);
  const { allPayments, allTx, allHpp, allOpCosts } = await fetchChartRawData(
    chartStart,
    chartEnd
  );

  const kpi = computePeriodStat(allPayments, allHpp, allOpCosts, allTx, kpiStart, kpiEnd);
  const prev = computePeriodStat(allPayments, allHpp, allOpCosts, allTx, prevStart, prevEnd);

  const calcTrend = (curr: number, prevVal: number): number => {
    if (prevVal === 0 && curr === 0) return 0;
    if (prevVal === 0) return 100;
    return Math.round(((curr - prevVal) / prevVal) * 1000) / 10;
  };

  const revenueTrend = calcTrend(kpi.revenue, prev.revenue);
  const grossProfitTrend = calcTrend(kpi.grossProfit, prev.grossProfit);
  const netProfitTrend = calcTrend(kpi.netProfit, prev.netProfit);
  const netMarginTrend = Math.round((kpi.netMargin - prev.netMargin) * 10) / 10;

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
      const stat = computePeriodStat(allPayments, allHpp, allOpCosts, allTx, s, e);
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
      const stat = computePeriodStat(allPayments, allHpp, allOpCosts, allTx, s, e);
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
      const stat = computePeriodStat(allPayments, allHpp, allOpCosts, allTx, s, e);
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
      const stat = computePeriodStat(allPayments, allHpp, allOpCosts, allTx, s, e);
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
