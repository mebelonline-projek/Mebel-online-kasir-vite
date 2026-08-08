import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { NotaDocument } from "@/components/invoice/nota-document";
import { Button } from "@/components/ui/button";
import { getStoreSettings } from "@/lib/settings";
import { mapTransactionLineItems } from "@/lib/pdf-invoice";
import { DEFAULT_LOGO } from "@/lib/store-logo";
import {
  getTransactionById,
  type TransactionDetail,
} from "@/lib/transactions";

export function NotaPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [store, setStore] = useState<{
    store_name?: string;
    address?: string | null;
    phone?: string | null;
    logo_url?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const [txResult, settings] = await Promise.all([
        getTransactionById(id),
        getStoreSettings(),
      ]);
      if (!mounted) return;
      if (!txResult.success || !txResult.data) {
        setError(txResult.message || "Transaksi tidak ditemukan");
        setTx(null);
        toast.error(txResult.message || "Transaksi tidak ditemukan");
      } else {
        setTx(txResult.data);
      }
      setStore(settings);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="mx-auto h-96 max-w-[500px] rounded-xl bg-muted/50" />
      </div>
    );
  }

  if (!tx || error) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">
          {error || "Transaksi tidak ditemukan."}
        </p>
        <Button variant="outline" onClick={() => navigate("/transaksi")}>
          Kembali ke daftar
        </Button>
      </div>
    );
  }

  const lineItems = mapTransactionLineItems(tx.transaction_items, {
    description: tx.description,
    final_price: tx.final_price,
  });

  return (
    <div className="mx-auto max-w-7xl">
      <NotaDocument
        transaction_id={tx.id}
        transaction_number={tx.transaction_number}
        customer_name={tx.customer_name || "—"}
        description={tx.description}
        lineItems={lineItems}
        customerCharges={tx.transaction_customer_charges.map((c) => ({
          name: c.name,
          amount: c.amount,
        }))}
        final_price={tx.final_price}
        payment_type={tx.payment_type}
        dp_amount={tx.dp_amount}
        status={tx.status}
        created_at={tx.created_at}
        payments={tx.transaction_payments}
        store_name={store?.store_name}
        store_address={store?.address ?? undefined}
        store_phone={store?.phone ?? undefined}
        logo_url={store?.logo_url ?? DEFAULT_LOGO}
      />
    </div>
  );
}
