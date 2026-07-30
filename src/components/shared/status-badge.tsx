interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { className: string; label: string }> = {
  LUNAS: { className: "status-lunas", label: "Lunas" },
  DP: { className: "status-dp", label: "DP" },
  MENUNGGU_PELUNASAN: {
    className: "status-dp",
    label: "Menunggu Pelunasan",
  },
  BATAL: { className: "status-batal", label: "Batal" },
  MENUNGGU: { className: "status-menunggu", label: "Menunggu" },
  MENYIMPAN: { className: "status-menunggu", label: "Menyimpan..." },
  GAGAL: { className: "status-batal", label: "Gagal Sync" },
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    className: "status-menunggu",
    label: status,
  };

  const isSaving = status === "MENYIMPAN";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold tracking-wider uppercase ${config.className} ${className}`}
    >
      {isSaving ? (
        <span className="inline-block h-1.5 w-1.5 animate-spin rounded-full border border-current border-t-transparent" />
      ) : (
        <span className="dot inline-block h-1.5 w-1.5 rounded-full" />
      )}
      {config.label}
    </span>
  );
}
