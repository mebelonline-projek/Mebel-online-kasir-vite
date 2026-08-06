import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";

export interface CustomerChargeLine {
  key: string;
  name: string;
  amount: string;
}

function newCharge(): CustomerChargeLine {
  return {
    key: crypto.randomUUID(),
    name: "",
    amount: "",
  };
}

export function createEmptyCustomerCharges(): CustomerChargeLine[] {
  return [];
}

export function customerChargesTotal(charges: CustomerChargeLine[]): number {
  return charges.reduce((sum, c) => {
    const name = c.name.trim();
    const amount = Number(c.amount) || 0;
    if (!name || amount <= 0) return sum;
    return sum + amount;
  }, 0);
}

export function toCustomerChargePayload(charges: CustomerChargeLine[]) {
  return charges
    .filter((c) => c.name.trim() && (Number(c.amount) || 0) > 0)
    .map((c) => ({
      name: c.name.trim(),
      amount: Number(c.amount) || 0,
    }));
}

interface Props {
  charges: CustomerChargeLine[];
  onChange: (charges: CustomerChargeLine[]) => void;
}

export function CustomerChargesEditor({ charges, onChange }: Props) {
  const total = customerChargesTotal(charges);

  function update(index: number, patch: Partial<CustomerChargeLine>) {
    onChange(charges.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function remove(index: number) {
    onChange(charges.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Biaya dibebankan ke pembeli</p>
          <p className="text-xs text-muted-foreground">
            Mis. ongkir — masuk nota, tidak dihitung omzet
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          onClick={() => onChange([...charges, newCharge()])}
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah
        </Button>
      </div>

      {charges.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Opsional. Tambah jika ada ongkir / biaya lain yang ditanggung pembeli.
        </p>
      ) : (
        <div className="space-y-2">
          {charges.map((charge, index) => (
            <div
              key={charge.key}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Nama
                </label>
                <Input
                  value={charge.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  placeholder="Ongkir"
                  className="h-11"
                  maxLength={100}
                />
              </div>
              <div className="w-full space-y-1.5 sm:w-44">
                <label className="text-xs font-medium text-muted-foreground">
                  Nominal
                </label>
                <CurrencyInput
                  value={charge.amount}
                  onChange={(v) => update(index, { amount: v })}
                  placeholder="200.000"
                  className="h-11"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(index)}
                aria-label="Hapus biaya"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {total > 0 && (
            <div className="flex justify-between px-1 text-sm">
              <span className="text-muted-foreground">Total biaya pembeli</span>
              <span className="font-semibold">{formatCurrency(total)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
