import { lazy, Suspense } from "react";
import type { DashboardMonthlyData } from "@/lib/dashboard";

const OwnerChart = lazy(() =>
  import("./owner-chart").then((mod) => ({ default: mod.OwnerChart }))
);

export function OwnerChartWrapper(props: {
  data: DashboardMonthlyData[];
  period?: string;
}) {
  return (
    <Suspense
      fallback={
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          Memuat grafik...
        </div>
      }
    >
      <OwnerChart {...props} />
    </Suspense>
  );
}
