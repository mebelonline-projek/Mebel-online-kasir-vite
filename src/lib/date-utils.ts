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

/** Batas periode KPI, prev, dan chart — semua dalam WIB */
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
    const prevMonday = addWibDays(monday, -7);
    const prevSunday = addWibDays(prevMonday, 6);
    const chartMonday = addWibDays(monday, -77);
    return {
      kpiStart: wibToDate(wibStartISO(monday)),
      kpiEnd: wibToDate(wibEndISO(sunday)),
      prevStart: wibToDate(wibStartISO(prevMonday)),
      prevEnd: wibToDate(wibEndISO(prevSunday)),
      chartStart: wibToDate(wibStartISO(chartMonday)),
      chartEnd: wibToDate(wibEndISO(sunday)),
    };
  }

  if (period === "monthly") {
    const monthStart = getWibMonthStart(today);
    const monthEnd = getWibMonthEnd(today);
    const prevMonthDate = addWibDays(monthStart, -1);
    const prevMonthStart = getWibMonthStart(prevMonthDate);
    const prevMonthEnd = getWibMonthEnd(prevMonthDate);
    const { year, month } = parseWibDate(today);
    let cy = year;
    let cm = month - 11;
    while (cm <= 0) {
      cm += 12;
      cy -= 1;
    }
    const chartMonthStart = `${cy}-${String(cm).padStart(2, "0")}-01`;
    return {
      kpiStart: wibToDate(wibStartISO(monthStart)),
      kpiEnd: wibToDate(wibEndISO(monthEnd)),
      prevStart: wibToDate(wibStartISO(prevMonthStart)),
      prevEnd: wibToDate(wibEndISO(prevMonthEnd)),
      chartStart: wibToDate(wibStartISO(chartMonthStart)),
      chartEnd: wibToDate(wibEndISO(monthEnd)),
    };
  }

  const year = today.split("-")[0];
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const prevYear = String(Number(year) - 1);
  const prevYearStart = `${prevYear}-01-01`;
  const prevYearEnd = `${prevYear}-12-31`;
  const chartYearStart = `${String(Number(year) - 4)}-01-01`;

  return {
    kpiStart: wibToDate(wibStartISO(yearStart)),
    kpiEnd: wibToDate(wibEndISO(yearEnd)),
    prevStart: wibToDate(wibStartISO(prevYearStart)),
    prevEnd: wibToDate(wibEndISO(prevYearEnd)),
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
