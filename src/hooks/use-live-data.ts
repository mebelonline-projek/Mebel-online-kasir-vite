import { useCallback, useEffect, useRef, useState } from "react";
import { onDataChanged } from "@/lib/data-events";

const FOCUS_DEBOUNCE_MS = 800;

/**
 * Local-first + multi-device:
 * - `getCached` → paint instan di device ini
 * - `fetcher` → selalu network saat online (sumber kebenaran shared DB)
 * - refetch saat Realtime / sync / online / focus (device lain ikut)
 */
export function useLiveData<T>(options: {
  getCached: () => T | Promise<T>;
  fetcher: () => Promise<T>;
  isEqual?: (a: T, b: T) => boolean;
}) {
  const { getCached, fetcher, isEqual } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const hasData = useRef(false);
  const fetcherRef = useRef(fetcher);
  const getCachedRef = useRef(getCached);
  const isEqualRef = useRef(isEqual);
  fetcherRef.current = fetcher;
  getCachedRef.current = getCached;
  isEqualRef.current = isEqual;

  const apply = useCallback((next: T) => {
    if (!mounted.current) return;
    hasData.current = true;
    setData((prev) => {
      if (prev != null && isEqualRef.current?.(prev, next)) return prev;
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const background = hasData.current;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const next = await fetcherRef.current();
      apply(next);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Gagal memuat");
    } finally {
      if (!mounted.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const cached = await getCachedRef.current();
        if (cancelled || !mounted.current) return;
        if (cached != null) {
          apply(cached);
          setLoading(false);
        }
      } catch {
        /* cache kosong OK */
      }
      if (cancelled || !mounted.current) return;
      await refresh();
    })();

    const unsub = onDataChanged(() => {
      void refresh();
    });

    const onOnline = () => {
      void refresh();
    };

    let focusTimer: number | undefined;
    const onFocusOrVisible = () => {
      if (document.visibilityState === "hidden") return;
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        void refresh();
      }, FOCUS_DEBOUNCE_MS);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      cancelled = true;
      mounted.current = false;
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.clearTimeout(focusTimer);
    };
  }, [apply, refresh]);

  return { data, loading, refreshing, error, refresh };
}
