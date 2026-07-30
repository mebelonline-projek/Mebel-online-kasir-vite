import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type AppStore = {
  store_name: string;
  logo_url: string | null;
};

const DEFAULT_STORE: AppStore = {
  store_name: "Mebel Online",
  logo_url: null,
};

const StoreContext = createContext<AppStore>(DEFAULT_STORE);

export function StoreProvider({
  children,
  store = DEFAULT_STORE,
}: {
  children: ReactNode;
  store?: AppStore;
}) {
  const value = useMemo(() => store, [store]);
  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
