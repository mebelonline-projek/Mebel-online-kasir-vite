import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { SearchablePicker } from "@/components/shared/searchable-picker";
import {
  createDefaultLineItems,
  LineItemsEditor,
  lineItemsTotal,
  type LineItem,
} from "@/components/transactions/line-items-editor";
import {
  createEmptyCustomerCharges,
  CustomerChargesEditor,
  customerChargesTotal,
  toCustomerChargePayload,
  type CustomerChargeLine,
} from "@/components/transactions/customer-charges-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  getCachedCustomers,
  getCachedProducts,
  getCachedStocks,
  getCachedWarehouses,
  refreshCatalogCache,
} from "@/lib/catalog-cache";
import { emitDataChanged } from "@/lib/data-events";
import { formatCurrency } from "@/lib/formatters";
import { parseRupiahInteger } from "@/lib/money";
import {
  getTransactionDateBounds,
  wibNoonISO,
} from "@/lib/date-utils";
import { Input } from "@/components/ui/input";
import type {
  CachedCustomer,
  CachedProduct,
  CachedStock,
  CachedWarehouse,
} from "@/lib/offline-db";
import { queueOfflineTransaction } from "@/lib/offline-sync";
import { createTransaction } from "@/lib/transactions";

export function KasirPage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const dateBounds = useMemo(() => getTransactionDateBounds(), []);

  const [customers, setCustomers] = useState<CachedCustomer[]>([]);
  const [products, setProducts] = useState<CachedProduct[]>([]);
  const [warehouses, setWarehouses] = useState<CachedWarehouse[]>([]);
  const [stocks, setStocks] = useState<CachedStock[]>([]);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>(createDefaultLineItems);
  const [customerCharges, setCustomerCharges] = useState<CustomerChargeLine[]>(
    createEmptyCustomerCharges
  );
  const [paymentType, setPaymentType] = useState<"CASH" | "DP">("CASH");
  const [paymentMethod, setPaymentMethod] = useState<"TUNAI" | "TRANSFER">(
    "TUNAI"
  );
  const [dpAmount, setDpAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(dateBounds.today);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (navigator.onLine) await refreshCatalogCache();
      const [c, p, w, s] = await Promise.all([
        getCachedCustomers(),
        getCachedProducts(),
        getCachedWarehouses(),
        getCachedStocks(),
      ]);
      if (!mounted) return;
      setCustomers(c);
      setProducts(p);
      setWarehouses(w);
      setStocks(s);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        id: c.id,
        label: c.name,
        sublabel: c.phone || undefined,
      })),
    [customers]
  );

  const itemsTotal = lineItemsTotal(lineItems);
  const chargesTotal = customerChargesTotal(customerCharges);
  const finalPriceNum = itemsTotal;
  const totalDue = itemsTotal + chargesTotal;
  const dpAmountNum = Number(dpAmount) || 0;
  const remaining = Math.max(0, totalDue - dpAmountNum);
  const isDp = paymentType === "DP";
  const isBackdated = transactionDate < dateBounds.today;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validItems = lineItems.filter(
      (i) => i.product_name.trim() && (Number(i.unit_price) || 0) > 0
    );
    if (validItems.length === 0) {
      toast.error("Minimal satu item dengan nama dan harga");
      return;
    }

    const total = lineItemsTotal(validItems);
    if (total <= 0) {
      toast.error("Total harus lebih dari 0");
      return;
    }

    const chargesPayload = toCustomerChargePayload(customerCharges);
    const chargesSum = chargesPayload.reduce((s, c) => s + c.amount, 0);
    const due = total + chargesSum;

    let dp = 0;
    if (paymentType === "DP") {
      const dpParsed = parseRupiahInteger(dpAmount);
      if (!dpParsed.ok) {
        toast.error(dpParsed.message);
        return;
      }
      dp = dpParsed.value;
      if (dp >= due) {
        toast.error("DP harus kurang dari total tagihan");
        return;
      }
    }

    const payload = {
      customer_id: customerId || "",
      customer_name: customerName || null,
      description: null as string | null,
      final_price: total,
      payment_type: paymentType,
      payment_method: paymentMethod,
      dp_amount: dp,
      transaction_date: transactionDate,
      items: validItems.map((i) => ({
        product_id: i.product_id || "",
        product_name: i.product_name.trim(),
        quantity: i.quantity,
        unit_price: Number(i.unit_price) || 0,
        note: i.note || "",
        warehouse_id: i.warehouse_id || "",
      })),
      customer_charges: chargesPayload,
    };

    setLoading(true);

    if (!navigator.onLine) {
      try {
        await queueOfflineTransaction(payload);
        toast.success("Transaksi disimpan offline — akan sync saat online");
        setLoading(false);
        navigate("/transaksi");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Gagal simpan offline"
        );
        setLoading(false);
      }
      return;
    }

    const result = await createTransaction(payload);
    setLoading(false);
    if (!result.success) {
      toast.error(result.message || "Gagal menyimpan");
      return;
    }
    emitDataChanged("create");
    void refreshCatalogCache();

    const txId = result.data?.id;
    if (txId) {
      toast.success(result.message || "Berhasil", {
        action: {
          label: "Cetak Nota",
          onClick: () => navigate(`/transaksi/${txId}/nota`),
        },
        duration: 8000,
      });
      navigate(`/transaksi/${txId}`);
    } else {
      toast.success(result.message || "Berhasil");
      navigate("/transaksi");
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      navigate(-1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Kasir</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Input cepat transaksi — Ctrl+Enter untuk simpan
          {!import.meta.env.VITE_EDGE_APPLY_SALE_STOCK_URL && (
            <span className="block text-amber-700 dark:text-amber-400">
              Potong stok belum aktif (set VITE_EDGE_APPLY_SALE_STOCK_URL setelah
              deploy Edge Function).
            </span>
          )}
        </p>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-6 md:p-8">
          <form
            ref={formRef}
            onSubmit={(e) => void onSubmit(e)}
            onKeyDown={onKeyDown}
          >
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_280px] lg:gap-8">
              {totalDue > 0 && (
                <Card className="order-first shadow-sm lg:order-last lg:sticky lg:top-6 lg:self-start">
                  <CardContent className="space-y-3 p-6">
                    <p className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      Ringkasan
                    </p>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal barang</span>
                      <span className="font-semibold">
                        {formatCurrency(finalPriceNum)}
                      </span>
                    </div>
                    {chargesTotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Biaya pembeli
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(chargesTotal)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total tagihan</span>
                      <span className="font-bold">
                        {formatCurrency(totalDue)}
                      </span>
                    </div>
                    {isDp && dpAmountNum > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">DP</span>
                          <span>{formatCurrency(dpAmountNum)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-semibold text-amber-600 dark:text-amber-400">
                          <span>Sisa</span>
                          <span>{formatCurrency(remaining)}</span>
                        </div>
                      </>
                    )}
                    <div className="border-t border-border pt-2">
                      <p className="text-xs text-muted-foreground">
                        {paymentType === "CASH"
                          ? "Pembayaran lunas"
                          : "Pembayaran DP"}{" "}
                        · {paymentMethod === "TUNAI" ? "Tunai" : "Transfer"}
                      </p>
                      {chargesTotal > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Biaya pembeli tidak masuk omzet dashboard
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-6">
                <SearchablePicker
                  label="Pelanggan"
                  placeholder="Cari pelanggan..."
                  options={customerOptions}
                  value={customerId}
                  onChange={(id, opt) => {
                    setCustomerId(id);
                    if (opt) setCustomerName(opt.label);
                  }}
                  manualValue={customerName}
                  onManualChange={(v) => {
                    setCustomerName(v);
                    setCustomerId(null);
                  }}
                  manualPlaceholder="Atau ketik nama pelanggan..."
                />

                <div className="space-y-1.5">
                  <label htmlFor="transaction_date" className="text-sm font-medium">
                    Tanggal transaksi
                  </label>
                  <Input
                    id="transaction_date"
                    type="date"
                    value={transactionDate}
                    min={dateBounds.min}
                    max={dateBounds.today}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    className="h-12"
                  />
                  {isBackdated && (
                    <p className="text-xs text-muted-foreground">
                      Mundur ke{" "}
                      {new Date(wibNoonISO(transactionDate)).toLocaleDateString(
                        "id-ID",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          timeZone: "Asia/Jakarta",
                        }
                      )}
                      . Nomor TRX tetap mengikuti hari input.
                    </p>
                  )}
                </div>

                <LineItemsEditor
                  items={lineItems}
                  onChange={setLineItems}
                  products={products}
                  warehouses={warehouses}
                  stocks={stocks}
                />

                <CustomerChargesEditor
                  charges={customerCharges}
                  onChange={setCustomerCharges}
                />

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Tipe Pembayaran <span className="text-destructive">*</span>
                  </label>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant={paymentType === "CASH" ? "default" : "outline"}
                      className="h-12 flex-1 text-base"
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
                      className="h-12 flex-1 text-base"
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
                      placeholder={
                        totalDue > 1
                          ? `Maks ${formatCurrency(totalDue - 1)}`
                          : "500.000"
                      }
                      className="h-12 text-lg"
                      required
                    />
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
                      className="h-12 flex-1"
                      onClick={() => setPaymentMethod("TUNAI")}
                    >
                      Tunai
                    </Button>
                    <Button
                      type="button"
                      variant={
                        paymentMethod === "TRANSFER" ? "default" : "outline"
                      }
                      className="h-12 flex-1"
                      onClick={() => setPaymentMethod("TRANSFER")}
                    >
                      Transfer
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Pintasan: Ctrl+Enter simpan · Esc batal
                  {!navigator.onLine && " · Mode offline aktif"}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] w-full sm:w-auto"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Batal
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="h-12 min-h-[44px] w-full gap-2 px-6 text-base sm:w-auto"
              >
                {loading ? (
                  "Menyimpan..."
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {navigator.onLine
                      ? "Simpan Transaksi"
                      : "Simpan Offline"}
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
