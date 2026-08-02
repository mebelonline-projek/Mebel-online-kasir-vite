import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import { TransaksiDetailSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getCachedCustomers,
  refreshCatalogCache,
} from "@/lib/catalog-cache";
import { emitDataChanged } from "@/lib/data-events";
import { formatCurrency } from "@/lib/formatters";
import { parseRupiahInteger } from "@/lib/money";
import type { CachedCustomer } from "@/lib/offline-db";
import {
  getTransactionById,
  updateTransaction,
} from "@/lib/transactions";
import { transactionSchema } from "@/lib/validation";

export function TransaksiEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [txNumber, setTxNumber] = useState("");
  const [customers, setCustomers] = useState<CachedCustomer[]>([]);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [paymentType, setPaymentType] = useState<"CASH" | "DP">("DP");
  const [paymentMethod, setPaymentMethod] = useState<"TUNAI" | "TRANSFER">(
    "TUNAI"
  );
  const [dpAmount, setDpAmount] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id || id.startsWith("offline:")) {
      toast.error("Transaksi offline belum tersinkron");
      navigate("/transaksi", { replace: true });
      return;
    }

    let mounted = true;
    void (async () => {
      if (navigator.onLine) await refreshCatalogCache();
      const [result, cachedCustomers] = await Promise.all([
        getTransactionById(id),
        getCachedCustomers(),
      ]);
      if (!mounted) return;

      if (!result.success || !result.data) {
        toast.error(result.message || "Tidak ditemukan");
        navigate("/transaksi", { replace: true });
        return;
      }

      if (result.data.status !== "DP") {
        toast.error("Hanya transaksi DP yang bisa diedit");
        navigate(`/transaksi/${id}`, { replace: true });
        return;
      }

      setCustomers(cachedCustomers);
      setTxNumber(result.data.transaction_number);
      setCustomerId(result.data.customer_id);
      setCustomerName(result.data.customer_name || "");
      setProductId(result.data.product_id || "");
      setDescription(result.data.description || "");
      setFinalPrice(String(result.data.final_price));
      setPaymentType(result.data.payment_type);
      setDpAmount(
        result.data.payment_type === "DP"
          ? String(result.data.dp_amount)
          : ""
      );
      const firstPay = result.data.transaction_payments[0];
      if (firstPay?.method === "TRANSFER" || firstPay?.method === "TUNAI") {
        setPaymentMethod(firstPay.method);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [id, navigate]);

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        id: c.id,
        label: c.name,
        sublabel: c.phone || undefined,
      })),
    [customers]
  );

  const finalPriceNum = Number(finalPrice) || 0;
  const dpAmountNum = Number(dpAmount) || 0;
  const remaining = Math.max(0, finalPriceNum - dpAmountNum);
  const isDp = paymentType === "DP";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    const priceParsed = parseRupiahInteger(finalPrice);
    if (!priceParsed.ok) {
      setFieldErrors({ final_price: priceParsed.message });
      toast.error(priceParsed.message);
      return;
    }

    let dp = 0;
    if (paymentType === "DP") {
      const dpParsed = parseRupiahInteger(dpAmount);
      if (!dpParsed.ok) {
        setFieldErrors({ dp_amount: dpParsed.message });
        toast.error(dpParsed.message);
        return;
      }
      dp = dpParsed.value;
    }

    const payload = {
      customer_id: customerId || "",
      product_id: productId || "",
      customer_name: customerName || null,
      description: description || null,
      final_price: priceParsed.value,
      payment_type: paymentType,
      payment_method: paymentMethod,
      dp_amount: dp,
    };

    const parsed = transactionSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      toast.error(parsed.error.issues[0]?.message || "Validasi gagal");
      return;
    }

    setFieldErrors({});
    setSaving(true);
    const result = await updateTransaction(id, parsed.data);
    setSaving(false);

    if (!result.success) {
      toast.error(result.message || "Gagal menyimpan");
      return;
    }

    emitDataChanged("manual");
    toast.success(result.message || "Berhasil");
    navigate(`/transaksi/${id}`, { replace: true });
  }

  if (loading) {
    return <TransaksiDetailSkeleton />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Edit Transaksi
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {txNumber} · hanya header & DP (item/stok tidak diubah)
        </p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6 md:p-8">
          <form onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-6">
              <SearchablePicker
                label="Pelanggan"
                placeholder="Cari pelanggan..."
                options={customerOptions}
                value={customerId}
                onChange={(cid, opt) => {
                  setCustomerId(cid);
                  setCustomerName(opt?.label || "");
                }}
                allowManual
                manualValue={customerName}
                onManualChange={(v) => {
                  setCustomerName(v);
                  setCustomerId(null);
                }}
                manualPlaceholder="Atau ketik nama pelanggan..."
              />

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Deskripsi</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deskripsi produk / catatan"
                  className="min-h-[80px] resize-y"
                />
                {fieldErrors.description && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.description}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Harga Jual <span className="text-destructive">*</span>
                </label>
                <CurrencyInput
                  value={finalPrice}
                  onChange={setFinalPrice}
                  placeholder="1.000.000"
                  className={
                    fieldErrors.final_price ? "border-destructive" : ""
                  }
                />
                {fieldErrors.final_price && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.final_price}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Tipe Pembayaran <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant={paymentType === "CASH" ? "default" : "outline"}
                    className="min-h-[44px] flex-1"
                    onClick={() => {
                      setPaymentType("CASH");
                      setDpAmount("");
                    }}
                  >
                    Cash (Lunas)
                  </Button>
                  <Button
                    type="button"
                    variant={paymentType === "DP" ? "default" : "outline"}
                    className="min-h-[44px] flex-1"
                    onClick={() => setPaymentType("DP")}
                  >
                    DP (Uang Muka)
                  </Button>
                </div>
              </div>

              {isDp && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Jumlah DP <span className="text-destructive">*</span>
                  </label>
                  <CurrencyInput
                    value={dpAmount}
                    onChange={setDpAmount}
                    placeholder={`Min Rp 1, maks ${formatCurrency(Math.max(0, finalPriceNum - 1))}`}
                    className={
                      fieldErrors.dp_amount ? "border-destructive" : ""
                    }
                  />
                  {fieldErrors.dp_amount && (
                    <p className="text-xs text-destructive">
                      {fieldErrors.dp_amount}
                    </p>
                  )}
                  {finalPriceNum > 0 && dpAmountNum > 0 && !fieldErrors.dp_amount && (
                    <p className="text-xs text-muted-foreground">
                      Sisa tagihan: {formatCurrency(remaining)}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Metode Pembayaran</label>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant={
                      paymentMethod === "TUNAI" ? "default" : "outline"
                    }
                    className="min-h-[44px] flex-1"
                    onClick={() => setPaymentMethod("TUNAI")}
                  >
                    Tunai
                  </Button>
                  <Button
                    type="button"
                    variant={
                      paymentMethod === "TRANSFER" ? "default" : "outline"
                    }
                    className="min-h-[44px] flex-1"
                    onClick={() => setPaymentMethod("TRANSFER")}
                  >
                    Transfer
                  </Button>
                </div>
              </div>

              {/* Keep product_id in form state without UI — edit tidak ubah line items */}
              <Input type="hidden" value={productId} readOnly />
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] w-full sm:w-auto"
                onClick={() => navigate(`/transaksi/${id}`)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Batal
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="min-h-[44px] w-full gap-2 sm:w-auto"
              >
                {saving ? (
                  "Menyimpan..."
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Simpan Perubahan
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
