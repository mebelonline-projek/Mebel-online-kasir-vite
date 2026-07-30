import type { DashboardStats, PeriodType } from "@/lib/dashboard";
import { getDashboardStats } from "@/lib/dashboard";
import { offlineDb } from "@/lib/offline-db";

export interface CachedDashboardStats {
  period: PeriodType;
  stats: DashboardStats;
  cachedAt: number;
}

export async function getCachedDashboardStats(
  period: PeriodType
): Promise<DashboardStats | null> {
  if (!offlineDb) return null;
  const row = await offlineDb.cachedDashboard.get(period);
  return row?.stats ?? null;
}

export async function saveDashboardStatsCache(
  period: PeriodType,
  stats: DashboardStats
): Promise<void> {
  if (!offlineDb) return;
  await offlineDb.cachedDashboard.put({
    period,
    stats,
    cachedAt: Date.now(),
  });
}

/** Network fetch + tulis Dexie; offline → cache terakhir. */
export async function loadDashboardStatsLive(
  period: PeriodType
): Promise<DashboardStats> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const cached = await getCachedDashboardStats(period);
    if (cached) return cached;
    throw new Error("Offline dan cache dashboard kosong");
  }

  try {
    const stats = await getDashboardStats(period);
    await saveDashboardStatsCache(period, stats);
    return stats;
  } catch (err) {
    const cached = await getCachedDashboardStats(period);
    if (cached) return cached;
    throw err;
  }
}
