import type { UserRole } from "@/types/common";

/** Dashboard href — SPA: satu route /dashboard (OWNER); karyawan → kasir. */
export function getDashboardHref(role: string | null | undefined): string {
  if (role === "OWNER") return "/dashboard";
  return "/kasir";
}

export function filterNavForRole<
  T extends {
    ownerOnly?: boolean;
    hideForGudang?: boolean;
    inventoryOnly?: boolean;
    gudangOnly?: boolean;
  },
>(items: T[], role: UserRole | string | null): T[] {
  return items.filter((item) => {
    if (role === "GUDANG") {
      return Boolean(item.inventoryOnly || item.gudangOnly);
    }
    if (item.gudangOnly) return false;
    if (item.ownerOnly && role !== "OWNER") return false;
    if (item.inventoryOnly && role !== "OWNER") return false;
    return true;
  });
}
