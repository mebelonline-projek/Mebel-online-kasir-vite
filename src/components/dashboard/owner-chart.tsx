import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DashboardMonthlyData } from "@/lib/dashboard";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  data: DashboardMonthlyData[];
  period?: string;
}

export function OwnerChart({ data }: Props) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        name: d.monthLabel,
        Omzet: d.revenue,
        "Laba Kotor": d.grossProfit,
        "Laba Bersih": d.netProfit,
      })),
    [data]
  );

  const formatRupiahCompact = (value: number) => {
    if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1)}M`;
    if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(0)}JT`;
    return formatCurrency(value);
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-bold text-muted-foreground mb-2">{label}</p>
        {payload.map((p) => (
          <p key={p.name} className="text-sm" style={{ color: p.color }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-2xl overflow-hidden p-4 md:p-6">
      <h3 className="text-lg md:text-xl font-bold text-foreground mb-4 md:mb-6">
        Omzet & Laba
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 10, bottom: 30 }}
        >
          <defs>
            <linearGradient id="colorOmzet" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#64748b" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#64748b" stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id="colorLabaKotor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="colorLabaBersih" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            opacity={0.3}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            tickFormatter={formatRupiahCompact}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "var(--muted-foreground)" }}
          />
          <Bar
            dataKey="Omzet"
            fill="url(#colorOmzet)"
            radius={[4, 4, 0, 0]}
            barSize={24}
          />
          <Area
            type="monotone"
            dataKey="Laba Kotor"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#colorLabaKotor)"
            dot={{ r: 4, fill: "#3b82f6", stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
          <Area
            type="monotone"
            dataKey="Laba Bersih"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#colorLabaBersih)"
            dot={{ r: 4, fill: "#10b981", stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
