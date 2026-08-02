import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, DollarSign, Percent, TrendingDown, TrendingUp } from "lucide-react";
import { OwnerChartWrapper } from "@/components/dashboard/owner-chart-wrapper";
import { PeriodSelector, periodOptions } from "@/components/dashboard/period-selector";
import { Sparkline } from "@/components/dashboard/sparkline";
import { StatusBadge } from "@/components/shared/status-badge";
import { DashboardSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLiveData } from "@/hooks/use-live-data";
import {
  getCachedDashboardStats,
  loadDashboardStatsLive,
} from "@/lib/dashboard-cache";
import type { DashboardStats, DashboardTrend, PeriodType } from "@/lib/dashboard";
import { formatCurrency, formatDate } from "@/lib/formatters";

function extractSparklineData(
  data: DashboardStats["monthlyData"],
  metric: "revenue" | "grossProfit" | "netProfit"
): number[] {
  return data.map((d) => d[metric]);
}

function trendIsUp(trend: DashboardTrend): boolean {
  return trend.direction === "up";
}

function formatTrendLabel(
  trend: DashboardTrend,
  unit: "percent" | "points"
): string {
  if (trend.direction === "flat" || trend.mode === "flat") return "— Tetap";

  const naik = trend.direction === "up";
  if (trend.mode === "from_loss") return "Naik (dari rugi)";
  if (trend.mode === "from_zero") return naik ? "Naik (dari nol)" : "Turun (dari nol)";
  if (trend.mode === "to_loss" && trend.percent == null) return "Turun (jadi rugi)";

  if (trend.percent == null) return naik ? "Naik" : "Turun";

  const value =
    trend.capped || trend.percent >= 999 ? ">999" : String(trend.percent);
  const suffix = unit === "points" ? " poin" : "%";
  return `${naik ? "Naik" : "Turun"} ${value}${suffix}`;
}

function DashboardBody({ period }: { period: PeriodType }) {
  const { data: stats, loading, refreshing, error } = useLiveData({
    getCached: () => getCachedDashboardStats(period),
    fetcher: () => loadDashboardStatsLive(period),
  });

  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  if (error && !stats) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const revenueSparkline = extractSparklineData(stats.monthlyData, "revenue");
  const grossProfitSparkline = extractSparklineData(stats.monthlyData, "grossProfit");
  const netProfitSparkline = extractSparklineData(stats.monthlyData, "netProfit");
  const marginSparkline = stats.monthlyData.map((d) =>
    d.revenue > 0 ? Math.round((d.netProfit / d.revenue) * 10000) / 100 : 0
  );
  const netMarginDisplay = stats.revenue > 0 ? `${stats.netMargin}%` : "-";

  const kpiCards: Array<{
    title: string;
    subtitle: string;
    value: string;
    trend: DashboardTrend;
    trendUnit: "percent" | "points";
    icon: typeof DollarSign;
    sparklineData: number[];
  }> = [
    {
      title: "Omzet",
      subtitle: "Uang masuk",
      value: formatCurrency(stats.revenue),
      trend: stats.revenueTrend,
      trendUnit: "percent",
      icon: DollarSign,
      sparklineData: revenueSparkline,
    },
    {
      title: "Laba Kotor",
      subtitle: "Omzet - HPP (proporsional)",
      value: formatCurrency(stats.grossProfit),
      trend: stats.grossProfitTrend,
      trendUnit: "percent",
      icon: TrendingUp,
      sparklineData: grossProfitSparkline,
    },
    {
      title: "Laba Bersih",
      subtitle: "Laba Kotor - Biaya Operasional",
      value: formatCurrency(stats.netProfit),
      trend: stats.netProfitTrend,
      trendUnit: "percent",
      icon: TrendingUp,
      sparklineData: netProfitSparkline,
    },
    {
      title: "Margin Bersih",
      subtitle: "Persentase Laba Bersih dari Omzet",
      value: netMarginDisplay,
      trend: stats.netMarginTrend,
      trendUnit: "points",
      icon: Percent,
      sparklineData: marginSparkline,
    },
  ];

  const periodScopeLabel =
    period === "daily"
      ? "Hari ini"
      : period === "weekly"
        ? "Minggu ini"
        : period === "monthly"
          ? "Bulan ini"
          : "Tahun ini";

  const chartHasActivity = stats.monthlyData.some((d) => d.revenue > 0);
  const kpiEmptyButChartHasData = stats.revenue === 0 && chartHasActivity;
  const periodLabel =
    periodOptions.find((o) => o.value === period)?.label.toLowerCase() || "periode";

  return (
    <>
      {refreshing && (
        <p className="text-xs text-muted-foreground">Memperbarui data…</p>
      )}

      {kpiEmptyButChartHasData && (
        <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/40 px-4 py-3">
          Belum ada penjualan di{" "}
          <span className="font-medium text-foreground">
            {periodScopeLabel.toLowerCase()}
          </span>
          . Angka kartu di bawah memang Rp 0 — grafik tetap menampilkan tren periode
          sebelumnya. Coba filter{" "}
          <span className="font-medium text-foreground">Tahun</span> untuk melihat
          omzet 2026.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          const up = trendIsUp(card.trend);
          const flat = card.trend.direction === "flat";
          const sparkColor = flat
            ? "stroke-muted-foreground"
            : up
              ? "stroke-emerald-500 dark:stroke-emerald-400"
              : "stroke-destructive";
          return (
            <Card
              key={card.title}
              className="shadow-sm hover:-translate-y-1 transition-all duration-300"
            >
              <CardContent className="p-6 flex flex-col justify-between h-44">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                      {card.title}
                    </span>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                      {periodScopeLabel}
                      {card.subtitle ? ` · ${card.subtitle}` : ""}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-bold tracking-tight">{card.value}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {flat ? (
                    <span className="text-xs font-bold text-muted-foreground">
                      {formatTrendLabel(card.trend, card.trendUnit)}
                    </span>
                  ) : up ? (
                    <span className="text-xs font-bold inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="w-3 h-3" />
                      {formatTrendLabel(card.trend, card.trendUnit)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold inline-flex items-center gap-0.5 text-destructive">
                      <TrendingDown className="w-3 h-3" />
                      {formatTrendLabel(card.trend, card.trendUnit)}
                    </span>
                  )}
                  {!flat && (
                    <span className="text-xs text-muted-foreground">
                      dari {periodLabel} lalu
                    </span>
                  )}
                </div>
                {card.sparklineData.length >= 2 && (
                  <Sparkline
                    data={card.sparklineData}
                    trend={up ? 1 : flat ? 0 : -1}
                    className={sparkColor}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {stats.monthlyData.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <OwnerChartWrapper data={stats.monthlyData} period={period} />
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Transaksi Terbaru</h3>
            <Link to="/transaksi">
              <Button
                type="button"
                variant="link"
                className="gap-1 text-xs font-bold uppercase tracking-wider"
              >
                Lihat Semua
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>

          {stats.recentTransactions.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-center text-muted-foreground">
              <span>Belum ada transaksi. Mulai catat transaksi pertama Anda!</span>
            </div>
          ) : (
            <>
              <div className="md:hidden space-y-3">
                {stats.recentTransactions.map((tx) => (
                  <Link
                    key={tx.id}
                    to={`/transaksi/${tx.id}`}
                    className="block p-4 rounded-lg bg-accent/50 border border-border hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-sm font-bold">
                        {tx.transaction_number}
                      </span>
                      <StatusBadge status={tx.status} />
                    </div>
                    <p className="font-medium">{tx.customer_name}</p>
                    <div className="flex justify-between items-center mt-2 text-sm">
                      <span className="font-bold">
                        {formatCurrency(tx.final_price)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDate(tx.created_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transaksi</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Jumlah</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tanggal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recentTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-sm font-bold">
                          <Link
                            to={`/transaksi/${tx.id}`}
                            className="hover:text-primary transition-colors"
                          >
                            {tx.transaction_number}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">{tx.customer_name}</TableCell>
                        <TableCell className="font-bold">
                          {formatCurrency(tx.final_price)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={tx.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(tx.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export function DashboardPage() {
  const [period, setPeriod] = useState<PeriodType>("monthly");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Ringkasan Keuangan
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {period === "daily" &&
              "KPI = hari ini vs kemarin. Grafik = 30 hari terakhir."}
            {period === "weekly" &&
              "KPI = minggu ini s/d hari ini vs rentang sama minggu lalu. Grafik = 12 minggu."}
            {period === "monthly" &&
              "KPI = bulan ini s/d hari ini vs tanggal sama bulan lalu. Grafik = 12 bulan."}
            {period === "yearly" &&
              "KPI = tahun ini s/d hari ini vs tanggal sama tahun lalu. Grafik = 5 tahun."}
          </p>
        </div>
        <PeriodSelector currentPeriod={period} onPeriodChange={setPeriod} />
      </div>

      <DashboardBody key={period} period={period} />
    </div>
  );
}
