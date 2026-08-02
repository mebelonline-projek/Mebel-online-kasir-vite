import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getStoreSettings } from "@/lib/settings";

export type AppStore = {
  store_name: string;
  logo_url: string | null;
};

interface StoreContextValue extends AppStore {
  setStoreLogo: (logoUrl: string | null) => void;
  setStoreName: (name: string) => void;
  refreshStore: () => Promise<void>;
}

const DEFAULT_STORE: AppStore = {
  store_name: "Mebel Online",
  logo_url: null,
};

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<AppStore>(DEFAULT_STORE);

  const refreshStore = useCallback(async () => {
    try {
      const settings = await getStoreSettings();
      if (settings) {
        setStore({
          store_name: settings.store_name || DEFAULT_STORE.store_name,
          logo_url: settings.logo_url,
        });
      }
    } catch {
      // state lama tetap dipakai
    }
  }, []);

  useEffect(() => {
    void refreshStore();
  }, [refreshStore]);

  const setStoreLogo = useCallback((logoUrl: string | null) => {
    setStore((prev) => ({ ...prev, logo_url: logoUrl }));
  }, []);

  const setStoreName = useCallback((name: string) => {
    setStore((prev) => ({ ...prev, store_name: name }));
  }, []);

  const value: StoreContextValue = {
    ...store,
    setStoreLogo,
    setStoreName,
    refreshStore,
  };

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useStore harus dipakai di dalam StoreProvider");
  }
  return ctx;
}
