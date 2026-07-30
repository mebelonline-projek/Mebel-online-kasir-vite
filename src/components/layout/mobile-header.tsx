import { useEffect, useState } from "react";
import { Sun, Moon, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreLogo } from "@/components/shared/store-logo";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import { useTheme } from "@/providers/theme-provider";

export function MobileHeader() {
  const store = useStore();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const brandName = store.store_name || "Mebel Online";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 pt-[env(safe-area-inset-top,0px)] shadow-sm backdrop-blur-sm lg:hidden">
      <div className="flex h-14 items-center justify-between px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <StoreLogo src={store.logo_url} alt={brandName} size="xs" />
          <span className="truncate text-sm font-bold tracking-tight text-foreground">
            {brandName}
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {mounted && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-10 w-10 rounded-lg p-0 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-2.5"
              aria-label={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" />
              )}
              <span className="hidden text-xs font-medium sm:inline">
                {theme === "dark" ? "Terang" : "Gelap"}
              </span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => void signOut()}
            className="h-10 w-10 rounded-lg border-destructive/20 p-0 text-destructive hover:border-destructive/40 hover:text-destructive sm:h-8 sm:w-auto sm:gap-1.5 sm:px-2.5"
            aria-label="Keluar"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden text-xs font-medium sm:inline">Keluar</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
