import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { emitDataChanged } from "@/lib/data-events";

let channel: RealtimeChannel | null = null;
let started = false;
let debounceTimer: number | undefined;

function emitRealtimeDebounced() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    emitDataChanged("realtime");
  }, 300);
}

/**
 * Multi-device: device lain menulis → tab ini refetch di background.
 * Cache Dexie hanya percepat UI lokal, bukan kebenaran tunggal.
 *
 * Wajib sekali di Supabase SQL Editor (project shared Opsi C):
 *   alter publication supabase_realtime add table public.transactions;
 *   alter publication supabase_realtime add table public.transaction_payments;
 */
export function startRealtimeSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  channel = supabase
    .channel("mebel-tx-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transactions" },
      () => emitRealtimeDebounced()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transaction_payments" },
      () => emitRealtimeDebounced()
    )
    .subscribe();
}

export function stopRealtimeSync(): void {
  window.clearTimeout(debounceTimer);
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  started = false;
}
