import { useCallback, useEffect, useState } from "react";
import { Bluetooth, Check, Loader2, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listPairedDevices,
  pairDevice,
  printBytes,
  printerErrorMessage,
  readPrinterSettings,
  savePrinterDevice,
  savePrinterMode,
  savePrinterPaper,
  scanDevices,
  type BluetoothDevice,
  type PrinterSettings,
} from "@/lib/bluetooth-printer";
import { cn } from "@/lib/utils";
import {
  buildThermalPayload,
  buildThermalTestLines,
  type ThermalPaperWidth,
  type ThermalPrintMode,
} from "@/lib/thermal-escpos";

type Busy = null | "list" | "scan" | "pair" | "test";

interface Message {
  tone: "info" | "success" | "error";
  text: string;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-muted p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "min-h-9 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PrinterSettingsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil tiap pengaturan berubah (untuk menyegarkan label di halaman). */
  onChanged?: (settings: PrinterSettings) => void;
}) {
  const [settings, setSettings] = useState<PrinterSettings>(readPrinterSettings);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [pairingAddress, setPairingAddress] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const refreshSettings = useCallback(() => {
    const next = readPrinterSettings();
    setSettings(next);
    onChanged?.(next);
  }, [onChanged]);

  const loadPaired = useCallback(async () => {
    setBusy("list");
    try {
      setDevices(await listPairedDevices());
    } catch (err) {
      setMessage({ tone: "error", text: printerErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSettings(readPrinterSettings());
    setMessage(null);
    void loadPaired();
  }, [open, loadPaired]);

  const handleScan = async () => {
    setMessage(null);
    setBusy("scan");
    try {
      const found = await scanDevices();
      setDevices(found);
      if (found.length === 0) {
        setMessage({
          tone: "info",
          text: "Printer tidak ditemukan. Pastikan printer menyala, dekat HP, dan tidak sedang tersambung ke HP lain. Di Android 11 ke bawah, Lokasi (GPS) HP juga harus menyala.",
        });
      }
    } catch (err) {
      setMessage({ tone: "error", text: printerErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const choose = (device: BluetoothDevice) => {
    savePrinterDevice(device);
    refreshSettings();
    setMessage({
      tone: "success",
      text: `Printer "${device.name || device.address}" dipilih. Ketuk Tes Cetak untuk mencoba.`,
    });
  };

  const handlePick = async (device: BluetoothDevice) => {
    if (busy) return;
    if (device.state === "bonded") {
      choose(device);
      return;
    }
    setBusy("pair");
    setPairingAddress(device.address);
    setMessage({
      tone: "info",
      text: "Memasangkan printer… Jika muncul permintaan PIN, isi 0000 atau 1234 (lihat buku manual printer), lalu ketuk Pasangkan.",
    });
    try {
      const paired = await pairDevice(device.address);
      if (paired) {
        choose({ ...device, state: "bonded" });
        setDevices(await listPairedDevices());
      } else {
        setMessage({
          tone: "error",
          text: "Pemasangan belum berhasil. Coba ketuk printernya lagi — atau pasangkan lewat Setelan HP → Bluetooth, lalu kembali ke sini.",
        });
      }
    } catch (err) {
      setMessage({ tone: "error", text: printerErrorMessage(err) });
    } finally {
      setBusy(null);
      setPairingAddress(null);
    }
  };

  const handlePaper = (paper: ThermalPaperWidth) => {
    savePrinterPaper(paper);
    refreshSettings();
  };

  const handleMode = (mode: ThermalPrintMode) => {
    savePrinterMode(mode);
    refreshSettings();
  };

  const handleTest = async () => {
    setMessage(null);
    setBusy("test");
    try {
      await printBytes(
        buildThermalPayload(
          buildThermalTestLines(settings.paper, settings.mode),
          settings.paper,
          settings.mode,
        ),
      );
      setMessage({
        tone: "success",
        text:
          settings.mode === "text"
            ? "Tes dikirim. Jika kertas keluar kosong atau hurufnya aneh, pilih mode Gambar lalu tes lagi."
            : "Tes dikirim. Jika penggaris terpotong atau patah 2 baris, ganti lebar kertas lalu tes lagi.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: printerErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const selectedLabel = settings.address
    ? settings.name || settings.address
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Atur Printer
          </DialogTitle>
          <DialogDescription>
            Printer thermal Bluetooth untuk cetak nota dari HP ini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Pilih printer</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleScan()}
              disabled={busy !== null}
              className="gap-1"
            >
              {busy === "scan" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {busy === "scan" ? "Mencari… (±8 detik)" : "Cari Printer"}
            </Button>
          </div>

          {busy === "list" && devices.length === 0 ? (
            <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat printer…
            </p>
          ) : devices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              Belum ada printer terpasang di HP ini. Nyalakan printer, lalu
              ketuk <span className="font-medium">Cari Printer</span>.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {devices.map((device) => {
                const selected = device.address === settings.address;
                const pairing = pairingAddress === device.address;
                return (
                  <li key={device.address}>
                    <button
                      type="button"
                      onClick={() => void handlePick(device)}
                      disabled={busy !== null && !pairing}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60",
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:bg-accent",
                      )}
                    >
                      <Bluetooth
                        className={cn(
                          "h-4 w-4 shrink-0",
                          selected ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {device.name || "Tanpa nama"}
                        </span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {device.address} ·{" "}
                          {device.state === "bonded"
                            ? "terpasang"
                            : "belum dipasangkan"}
                        </span>
                      </span>
                      {pairing ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : selected ? (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Terpilih:{" "}
            <span className="font-medium text-foreground">
              {selectedLabel ?? "belum ada"}
            </span>
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Lebar kertas</p>
          <Segmented
            value={settings.paper}
            onChange={handlePaper}
            disabled={busy === "test"}
            options={[
              { value: "58", label: "58 mm" },
              { value: "80", label: "80 mm" },
            ]}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Mode cetak</p>
          <Segmented
            value={settings.mode}
            onChange={handleMode}
            disabled={busy === "test"}
            options={[
              { value: "text", label: "Teks (disarankan)" },
              { value: "image", label: "Gambar" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            Teks lebih tajam & cepat. Pakai Gambar hanya jika tes cetak keluar
            kosong atau hurufnya aneh.
          </p>
        </div>

        {message && (
          <p
            role="status"
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              message.tone === "error" &&
                "bg-destructive/10 text-destructive",
              message.tone === "success" &&
                "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              message.tone === "info" && "bg-muted text-foreground",
            )}
          >
            {message.text}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Selesai
          </Button>
          <Button
            onClick={() => void handleTest()}
            disabled={!settings.address || busy !== null}
            className="gap-1"
          >
            {busy === "test" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="h-3.5 w-3.5" />
            )}
            {busy === "test" ? "Mencetak…" : "Tes Cetak"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
