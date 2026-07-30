/** Event bus ringan antar modul (sync → list, dll). Tanpa dependency. */

export const DATA_CHANGED_EVENT = "mebel:data-changed";

export type DataChangedDetail = {
  source: "sync" | "create" | "manual" | "realtime";
};

export function emitDataChanged(source: DataChangedDetail["source"]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DataChangedDetail>(DATA_CHANGED_EVENT, {
      detail: { source },
    })
  );
}

export function onDataChanged(
  handler: (detail: DataChangedDetail) => void
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<DataChangedDetail>).detail ?? {
      source: "manual" as const,
    };
    handler(detail);
  };
  window.addEventListener(DATA_CHANGED_EVENT, listener);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, listener);
}
