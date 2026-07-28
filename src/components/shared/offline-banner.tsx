import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  flushPendingTransactions,
  getPendingCount,
} from "@/lib/offline-sync";

export function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      void getPendingCount().then(setPending);
    };

    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    const id = window.setInterval(refresh, 5000);

    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.clearInterval(id);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div className="border-b border-border bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2">
          {!online && <WifiOff className="size-4" />}
          {!online
            ? "Mode offline — transaksi akan diantrikan."
            : `${pending} transaksi menunggu sinkronisasi.`}
        </p>
        {online && pending > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              await flushPendingTransactions();
              setPending(await getPendingCount());
              setSyncing(false);
            }}
          >
            {syncing ? "Menyinkronkan..." : "Sinkronkan sekarang"}
          </Button>
        )}
      </div>
    </div>
  );
}
