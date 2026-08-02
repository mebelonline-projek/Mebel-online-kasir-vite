// ============================================================
// DATE UTILS — WIB (Asia/Jakarta) — port dari Next
// ============================================================

const WIB_TIMEZONE = "Asia/Jakarta";

/** Tanggal hari ini dalam WIB, format YYYY-MM-DD */
export function getWibDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: WIB_TIMEZONE }).format(date);
}

/** Awal dan akhir hari dalam WIB (ISO string dengan offset +07:00) */
export function getWibDayBounds(date: Date = new Date()): {
  dateStr: string;
  start: string;
  end: string;
} {
  const dateStr = getWibDateString(date);
  return {
    dateStr,
    start: `${dateStr}T00:00:00+07:00`,
    end: `${dateStr}T23:59:59.999+07:00`,
  };
}

export function wibStartISO(dateStr: string): string {
  return `${dateStr}T00:00:00+07:00`;
}

export function wibEndISO(dateStr: string): string {
  return `${dateStr}T23:59:59.999+07:00`;
}

export function wibToDate(isoWib: string): Date {
  return new Date(isoWib);
}

/** Siang hari WIB — timestamp bisnis stabil untuk created_at / payment_date */
export function wibNoonISO(dateStr: string): string {
  return `${dateStr}T12:00:00+07:00`;
}

/** Batas mundur tanggal transaksi (hari) */
export const TRANSACTION_DATE_MAX_LOOKBACK_DAYS = 365;

/** Hari ini + batas minimum tanggal transaksi (WIB) */
export function getTransactionDateBounds(reference: Date = new Date()): {
  today: string;
  min: string;
} {
  const today = getWibDateString(reference);
  return {
    today,
    min: addWibDays(today, -TRANSACTION_DATE_MAX_LOOKBACK_DAYS),
  };
}

/** True jika YYYY-MM-DD dalam rentang [hari ini − lookback, hari ini] WIB */
export function isWibDateInAllowedRange(
  dateStr: string,
  lookbackDays: number = TRANSACTION_DATE_MAX_LOOKBACK_DAYS,
  reference: Date = new Date()
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const today = getWibDateString(reference);
  const min = addWibDays(today, -lookbackDays);
  return dateStr >= min && dateStr <= today;
}

/** Tambah hari ke tanggal WIB (YYYY-MM-DD) */
export function addWibDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return getWibDateString(d);
}

function getWibWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: WIB_TIMEZONE,
    weekday: "short",
  }).format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function getWibMonday(dateStr: string): string {
  const wd = getWibWeekday(dateStr);
  const monOffset = wd === 0 ? -6 : 1 - wd;
  return addWibDays(dateStr, monOffset);
}

export function getWibMonthStart(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}-${m}-01`;
}

export function getWibMonthEnd(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const firstOfNext = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return addWibDays(firstOfNext, -1);
}

export type PeriodType = "daily" | "weekly" | "monthly" | "yearly";

export interface WibPeriodBounds {
  kpiStart: Date;
  kpiEnd: Date;
  prevStart: Date;
  prevEnd: Date;
  chartStart: Date;
  chartEnd: Date;
}

/** Tanggal YYYY-MM-DD di bulan target, di-clamp ke hari terakhir bulan itu */
function clampWibDayInMonth(year: number, month: number, day: number): string {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = getWibMonthEnd(monthStart);
  const maxDay = parseWibDate(monthEnd).day;
  const clamped = Math.min(Math.max(day, 1), maxDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/**
 * Batas periode KPI, prev, dan chart — semua dalam WIB.
 * KPI vs prev memakai rentang setara (MTD/WTD/YTD), bukan vs periode penuh.
 */
export function getWibPeriodBounds(
  period: PeriodType,
  reference: Date = new Date()
): WibPeriodBounds {
  const today = getWibDateString(reference);

  if (period === "daily") {
    const yesterday = addWibDays(today, -1);
    const chartStartStr = addWibDays(today, -29);
    return {
      kpiStart: wibToDate(wibStartISO(today)),
      kpiEnd: wibToDate(wibEndISO(today)),
      prevStart: wibToDate(wibStartISO(yesterday)),
      prevEnd: wibToDate(wibEndISO(yesterday)),
      chartStart: wibToDate(wibStartISO(chartStartStr)),
      chartEnd: wibToDate(wibEndISO(today)),
    };
  }

  if (period === "weekly") {
    const monday = getWibMonday(today);
    const sunday = addWibDays(monday, 6);
    const dayOffset = (() => {
      let n = 0;
      let cursor = monday;
      while (cursor < today) {
        cursor = addWibDays(cursor, 1);
        n += 1;
      }
      return n;
    })();
    const prevMonday = addWibDays(monday, -7);
    const prevEndStr = addWibDays(prevMonday, dayOffset);
    const chartMonday = addWibDays(monday, -77);
    return {
      kpiStart: wibToDate(wibStartISO(monday)),
      kpiEnd: wibToDate(wibEndISO(today)),
      prevStart: wibToDate(wibStartISO(prevMonday)),
      prevEnd: wibToDate(wibEndISO(prevEndStr)),
      chartStart: wibToDate(wibStartISO(chartMonday)),
      chartEnd: wibToDate(wibEndISO(sunday)),
    };
  }

  if (period === "monthly") {
    const monthStart = getWibMonthStart(today);
    const monthEnd = getWibMonthEnd(today);
    const prevMonthDate = addWibDays(monthStart, -1);
    const prevMonthStart = getWibMonthStart(prevMonthDate);
    const { year, month, day } = parseWibDate(today);
    const prevParts = parseWibDate(prevMonthStart);
    const prevEndStr = clampWibDayInMonth(prevParts.year, prevParts.month, day);
    let cy = year;
    let cm = month - 11;
    while (cm <= 0) {
      cm += 12;
      cy -= 1;
    }
    const chartMonthStart = `${cy}-${String(cm).padStart(2, "0")}-01`;
    return {
      kpiStart: wibToDate(wibStartISO(monthStart)),
      kpiEnd: wibToDate(wibEndISO(today)),
      prevStart: wibToDate(wibStartISO(prevMonthStart)),
      prevEnd: wibToDate(wibEndISO(prevEndStr)),
      chartStart: wibToDate(wibStartISO(chartMonthStart)),
      chartEnd: wibToDate(wibEndISO(monthEnd)),
    };
  }

  const { year, month, day } = parseWibDate(today);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const prevYear = year - 1;
  const prevYearStart = `${prevYear}-01-01`;
  const prevEndStr = clampWibDayInMonth(prevYear, month, day);
  const chartYearStart = `${year - 4}-01-01`;

  return {
    kpiStart: wibToDate(wibStartISO(yearStart)),
    kpiEnd: wibToDate(wibEndISO(today)),
    prevStart: wibToDate(wibStartISO(prevYearStart)),
    prevEnd: wibToDate(wibEndISO(prevEndStr)),
    chartStart: wibToDate(wibStartISO(chartYearStart)),
    chartEnd: wibToDate(wibEndISO(yearEnd)),
  };
}

/** Label hari dalam WIB */
export function getWibDayLabel(dateStr: string): string {
  const labels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  return labels[getWibWeekday(dateStr)];
}

/** Komponen tanggal WIB */
export function parseWibDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}
