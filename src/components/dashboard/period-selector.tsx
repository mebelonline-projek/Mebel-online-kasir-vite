import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { PeriodType } from "@/lib/date-utils";

const periodOptions: { label: string; value: PeriodType }[] = [
  { label: "Hari", value: "daily" },
  { label: "Minggu", value: "weekly" },
  { label: "Bulan", value: "monthly" },
  { label: "Tahun", value: "yearly" },
];

export function PeriodSelector({
  currentPeriod,
  onPeriodChange,
  disabled,
}: {
  currentPeriod: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
  disabled?: boolean;
}) {
  return (
    <Tabs
      value={currentPeriod}
      onValueChange={(value) => {
        if (!value || value === currentPeriod) return;
        onPeriodChange(value as PeriodType);
      }}
    >
      <TabsList
        variant="line"
        className={cn("flex-wrap", disabled && "opacity-70 pointer-events-none")}
      >
        {periodOptions.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value}>
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export { periodOptions };
