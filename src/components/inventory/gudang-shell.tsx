import type { ReactNode } from "react";
import { GudangSubnav } from "@/components/inventory/gudang-subnav";

export function GudangShell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <GudangSubnav />
      {children}
    </div>
  );
}
