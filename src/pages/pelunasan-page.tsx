import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { PageListSkeleton } from "@/components/shared/page-skeleton";
import { emitDataChanged } from "@/lib/data-events";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { totalTagihan } from "@/lib/customer-charges";
import { addPayment, getTransactionById } from "@/lib/transactions";

export function PelunasanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [txNumber, setTxNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [finalPrice, setFinalPrice] = useState(0);
  const [payments, setPayments] = useState<
    Array<{
      id: string;
      amount: number;
      payment_date: string;
      method: string;
      note: string | null;
    }>
  >([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"TUNAI" | "TRANSFER">("TUNAI");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalPaid = useMemo(
    () => payments.reduce((s, p) => s + p.amount, 0),
    [payments]
  );
  const remaining = Math.max(0, finalPrice - totalPaid);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    void (async () => {
      const result = await getTransactionById(id);
      if (!mounted) return;
      if (!result.success || !result.data) {
        toast.error(result.message || "Tidak ditemukan");
        navigate("/transaksi", { replace: true });
        return;
      }
      const tx = result.data;
      if (tx.status === "LUNAS" || tx.status === "BATAL") {
        toast.message("Transaksi tidak perlu pelunasan");
        navigate(`/transaksi/${id}`, { replace: true });
        return;
      }
      setTxNumber(tx.transaction_number);
      setCustomerName(tx.customer_name || "Tanpa nama");
      setFinalPrice(
        totalTagihan(tx.final_price, tx.transaction_customer_charges)
      );
      setPayments(tx.transaction_payments);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    const value = Number(amount) || 0;
    if (value <= 0) {
      setError("Jumlah harus lebih dari 0");
      return;
    }
    if (value > remaining) {
      setError(`Jumlah melebihi sisa tagihan (${formatCurrency(remaining)})`);
      return;
    }

    setSubmitting(true);
    const result = await addPayment({
      transaction_id: id,
      amount: value,
      method,
      note,
    });
    setSubmitting(false);
    if (!result.success) {
      toast.error(result.message || "Gagal");
      return;
    }
    toast.success(result.message || "Berhasil");
    emitDataChanged("create");
    navigate(`/transaksi/${id}`, { replace: true });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl">
        <PageListSkeleton rows={3} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate(`/transaksi/${id}`)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Kembali
        </Button>
        <h1 className="font-mono text-2xl font-bold md:text-3xl">{txNumber}</h1>
      </div>

      <Card className="shadow-sm">
        <CardContent className="space-y-3 p-6">
          <h2 className="text-lg font-bold">Ringkasan Tagihan</h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pelanggan</span>
            <span className="font-semibold">{customerName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Tagihan</span>
            <span className="font-bold">{formatCurrency(finalPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sudah Dibayar</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalPaid)}
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
            <span>Sisa Tagihan</span>
            <span className="text-lg text-amber-600 dark:text-amber-400">
              {remaining <= 0 ? "Lunas" : formatCurrency(remaining)}
            </span>
          </div>
        </CardContent>
      </Card>

      {payments.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="space-y-3 p-6">
            <h2 className="text-lg font-bold">Pembayaran Sebelumnya</h2>
            <ul className="space-y-2">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-accent/20 p-3"
                >
                  <div>
                    <p className="font-semibold">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.payment_date)} — {p.method}
                    </p>
                    {p.note && (
                      <p className="text-xs text-muted-foreground">{p.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardContent className="p-6">
          <h2 className="mb-4 text-lg font-bold">Pembayaran Baru</h2>
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Jumlah Pembayaran *
                </label>
                <button
                  type="button"
                  className="cursor-pointer border-none bg-transparent text-xs text-primary hover:underline"
                  onClick={() => setAmount(String(remaining))}
                >
                  Bayar Lunas ({formatCurrency(remaining)})
                </button>
              </div>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                className="h-12 text-lg"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Metode</label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={method === "TUNAI" ? "default" : "outline"}
                  className="h-12 flex-1"
                  onClick={() => setMethod("TUNAI")}
                >
                  Tunai
                </Button>
                <Button
                  type="button"
                  variant={method === "TRANSFER" ? "default" : "outline"}
                  className="h-12 flex-1"
                  onClick={() => setMethod("TRANSFER")}
                >
                  Transfer
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Catatan</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Opsional"
              />
            </div>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/transaksi/${id}`)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={submitting || remaining <= 0}>
                {submitting ? "Menyimpan..." : "Simpan Pembayaran"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
