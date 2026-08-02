import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  createInvoice,
  getEligibleInvoiceTransactions,
  type EligibleInvoiceTransaction,
} from "@/lib/invoices";
import { formatCurrency, formatDate } from "@/lib/formatters";

export function InvoiceBuatPage() {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState("");
  const [transactions, setTransactions] = useState<EligibleInvoiceTransaction[]>(
    []
  );
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingTx, setLoadingTx] = useState(true);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoadingTx(true);
      const result = await getEligibleInvoiceTransactions();
      if (!mounted) return;
      if (!result.success || !result.data) {
        toast.error(result.message || "Gagal memuat transaksi");
        setTransactions([]);
      } else {
        setTransactions(result.data);
      }
      setLoadingTx(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleTx = (id: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTxs = transactions.filter((t) => selectedTxIds.has(t.id));
  const totalAmount = selectedTxs.reduce((sum, t) => sum + t.final_price, 0);
  const totalRemaining = selectedTxs.reduce((sum, t) => sum + t.remaining, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTxIds.size === 0) {
      toast.error("Pilih minimal 1 transaksi");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createInvoice({
        customer_name: customerName.trim() || undefined,
        transaction_ids: Array.from(selectedTxIds),
        notes: notes.trim() || undefined,
      });
      if (!result.success || !result.data) {
        throw new Error(result.message || "Gagal membuat invoice");
      }
      toast.success(result.message);
      navigate(`/invoice/${result.data.id}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Buat Invoice Baru
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoice untuk tagihan sisa pembayaran. Transaksi yang sudah lunas
          gunakan Nota.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="max-w-2xl space-y-6">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nama Pelanggan (opsional)</label>
          <Input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Masukkan nama pelanggan..."
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Pilih Transaksi <span className="text-destructive">*</span>
          </label>
          {loadingTx ? (
            <p className="text-sm text-muted-foreground">Memuat transaksi...</p>
          ) : transactions.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="p-6 text-center text-muted-foreground">
                Tidak ada transaksi DP atau menunggu pelunasan yang tersedia.
              </CardContent>
            </Card>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {transactions.map((tx) => (
                <label
                  key={tx.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selectedTxIds.has(tx.id)
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTxIds.has(tx.id)}
                    onChange={() => toggleTx(tx.id)}
                    className="h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">
                        {tx.transaction_number}
                      </span>
                      <StatusBadge status={tx.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(tx.created_at)}
                      {tx.customer_name ? ` — ${tx.customer_name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold">{formatCurrency(tx.final_price)}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Sisa: {formatCurrency(tx.remaining)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {selectedTxIds.size > 0 && (
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Ringkasan
              </p>
              <div className="flex justify-between text-sm">
                <span>{selectedTxIds.size} transaksi dipilih</span>
                <span>Total: {formatCurrency(totalAmount)}</span>
              </div>
              <div className="mt-1 flex justify-between text-lg font-bold">
                <span>Sisa tagihan</span>
                <span>{formatCurrency(totalRemaining)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Catatan (opsional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex min-h-[60px] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            placeholder="Catatan untuk invoice..."
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-border pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Batal
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || selectedTxIds.size === 0}
            className="gap-2"
          >
            {isSubmitting ? (
              "Membuat..."
            ) : (
              <>
                <Save className="h-4 w-4" />
                Buat Invoice
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
