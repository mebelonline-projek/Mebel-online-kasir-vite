import { FULFILLMENT_STATUSES } from "@/config/fulfillment";

interface Props {
  status: string;
  className?: string;
}

const styleMap: Record<string, string> = {
  MENUNGGU:
    "bg-stone-100 text-stone-700 dark:bg-stone-800/50 dark:text-stone-300",
  PRODUKSI: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  SIAP_KIRIM:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  SELESAI:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export function FulfillmentBadge({ status, className = "" }: Props) {
  const label =
    FULFILLMENT_STATUSES.find((s) => s.value === status)?.label ?? status;
  const styles = styleMap[status] ?? styleMap.MENUNGGU;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
