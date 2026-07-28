import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listRecentTransactions,
  type TransactionRow,
} from "@/lib/transactions";

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function TransaksiListPage() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const result = await listRecentTransactions(50);
      if (!mounted) return;
      if (!result.success) {
        toast.error(result.message || "Gagal memuat");
      } else {
        setRows(result.data || []);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Transaksi</h1>
        <Link to="/kasir">
          <Button type="button">Kasir baru</Button>
        </Link>
      </div>
      {loading ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">Belum ada data</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 p-3">
              <div>
                <p className="font-medium">{row.transaction_number}</p>
                <p className="text-sm text-muted-foreground">
                  {row.customer_name || "Tanpa nama"} —{" "}
                  {row.description || "-"}
                </p>
              </div>
              <div className="text-right text-sm">
                <p>{formatRp(row.final_price)}</p>
                <p className="text-muted-foreground">{row.status}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
