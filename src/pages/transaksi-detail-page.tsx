import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Wallet } from "lucide-react";
import { FulfillmentBadge } from "@/components/shared/fulfillment-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  getTransactionById,
  type TransactionDetail,
} from "@/lib/transactions";

export function TransaksiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || id.startsWith("offline:")) {
      toast.error("Transaksi offline belum tersinkron");
      navigate("/transaksi", { replace: true });
      return;
    }
    let mounted = true;
    void (async () => {
      const result = await getTransactionById(id);
      if (!mounted) return;
      if (!result.success || !result.data) {
        toast.error(result.message || "Tidak ditemukan");
        navigate("/transaksi", { replace: true });
        return;
      }
      setTx(result.data);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  const totals = useMemo(() => {
    if (!tx) return { paid: 0, remaining: 0 };
    const paid = tx.transaction_payments.reduce((s, p) => s + p.amount, 0);
    return { paid, remaining: Math.max(0, tx.final_price - paid) };
  }, [tx]);

  const canPelunasan =
    tx &&
    (tx.status === "DP" || tx.status === "MENUNGGU_PELUNASAN") &&
    totals.remaining > 0;

  if (loading || !tx) {
    return <p className="text-muted-foreground">Memuat detail...</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/transaksi")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Kembali
            </Button>
            <h1 className="font-mono text-2xl font-bold tracking-tight md:text-3xl">
              {tx.transaction_number}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={tx.status} />
            {tx.status !== "BATAL" && tx.fulfillment_status && (
              <FulfillmentBadge status={tx.fulfillment_status} />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(tx.created_at)}
          </p>
        </div>
        {canPelunasan && (
          <Link to={`/transaksi/${tx.id}/pelunasan`}>
            <Button type="button" className="min-h-[44px] gap-2">
              <Wallet className="h-4 w-4" />
              Input Pelunasan
            </Button>
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardContent className="space-y-3 p-6">
              <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
                Info Transaksi
              </h2>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Pelanggan</p>
                  <p className="font-semibold">
                    {tx.customer_name || "Tanpa nama"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tipe bayar</p>
                  <p className="font-semibold">
                    {tx.payment_type === "CASH" ? "Cash (Lunas)" : "DP"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground">Deskripsi</p>
                  <p className="font-semibold">{tx.description || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(tx.final_price)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {tx.transaction_items.length > 0 && (
            <Card className="shadow-sm">
              <CardContent className="space-y-3 p-6">
                <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
                  Item
                </h2>
                <ul className="divide-y divide-border">
                  {tx.transaction_items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {formatCurrency(item.unit_price)}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatCurrency(item.line_total)}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardContent className="space-y-3 p-6">
              <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
                Ringkasan
              </h2>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tagihan</span>
                <span className="font-semibold">
                  {formatCurrency(tx.final_price)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Dibayar</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totals.paid)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
                <span>Sisa</span>
                <span
                  className={
                    totals.remaining <= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {totals.remaining <= 0
                    ? "Lunas"
                    : formatCurrency(totals.remaining)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="space-y-3 p-6">
              <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
                Riwayat Pembayaran
              </h2>
              {tx.transaction_payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada</p>
              ) : (
                <ul className="space-y-2">
                  {tx.transaction_payments.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-lg bg-accent/20 p-3 text-sm"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">
                          {formatCurrency(p.amount)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {p.method}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.payment_date)}
                      </p>
                      {p.note && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {p.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
