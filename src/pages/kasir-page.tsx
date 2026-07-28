import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTransaction } from "@/lib/transactions";
import { queueOfflineTransaction } from "@/lib/offline-sync";
import { parseRupiahInteger } from "@/lib/money";

export function KasirPage() {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState("");
  const [description, setDescription] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [paymentType, setPaymentType] = useState<"CASH" | "DP">("CASH");
  const [paymentMethod, setPaymentMethod] = useState<"TUNAI" | "TRANSFER">(
    "TUNAI"
  );
  const [dpAmount, setDpAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const priceParsed = parseRupiahInteger(finalPrice);
    if (!priceParsed.ok) {
      toast.error(priceParsed.message);
      return;
    }

    let dp = 0;
    if (paymentType === "DP") {
      const dpParsed = parseRupiahInteger(dpAmount);
      if (!dpParsed.ok) {
        toast.error(dpParsed.message);
        return;
      }
      dp = dpParsed.value;
      if (dp >= priceParsed.value) {
        toast.error("DP harus kurang dari harga final");
        return;
      }
    }

    const payload = {
      customer_name: customerName || null,
      description: description || null,
      final_price: priceParsed.value,
      payment_type: paymentType,
      payment_method: paymentMethod,
      dp_amount: dp,
    };

    setLoading(true);

    if (!navigator.onLine) {
      try {
        await queueOfflineTransaction(payload);
        toast.success("Transaksi disimpan offline — akan sync saat online");
        setCustomerName("");
        setDescription("");
        setFinalPrice("");
        setDpAmount("");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Gagal simpan offline"
        );
      }
      setLoading(false);
      return;
    }

    const result = await createTransaction(payload);
    setLoading(false);
    if (!result.success) {
      toast.error(result.message || "Gagal menyimpan");
      return;
    }
    toast.success(result.message || "Berhasil");
    navigate("/transaksi");
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Kasir</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaksi cepat</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bisa dipakai offline. Item katalog + potong stok menyusul Fase 3
            (Edge Function).
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="customer">Nama pelanggan</Label>
              <Input
                id="customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Opsional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Deskripsi</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: Meja makan + kursi"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Harga final</Label>
              <Input
                id="price"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={finalPrice}
                onChange={(e) =>
                  setFinalPrice(e.target.value.replace(/[^\d]/g, ""))
                }
                placeholder="Contoh: 1000000"
                required
              />
              <p className="text-xs text-muted-foreground">
                Angka bulat tanpa titik/koma
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pay-type">Tipe bayar</Label>
                <select
                  id="pay-type"
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={paymentType}
                  onChange={(e) =>
                    setPaymentType(e.target.value as "CASH" | "DP")
                  }
                >
                  <option value="CASH">Lunas</option>
                  <option value="DP">DP</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-method">Metode</Label>
                <select
                  id="pay-method"
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as "TUNAI" | "TRANSFER")
                  }
                >
                  <option value="TUNAI">Tunai</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
              </div>
            </div>
            {paymentType === "DP" && (
              <div className="space-y-2">
                <Label htmlFor="dp">Jumlah DP</Label>
                <Input
                  id="dp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={dpAmount}
                  onChange={(e) =>
                    setDpAmount(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="Contoh: 500000"
                  required
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Menyimpan..."
                : navigator.onLine
                  ? "Simpan transaksi"
                  : "Simpan offline"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
