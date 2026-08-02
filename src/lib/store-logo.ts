/** Logo default brand (ikon sofa + gudang) — parity Next */
export const DEFAULT_LOGO = "/logo.png";

/** Ikon PWA / favicon — identitas instalasi brand (statis, bukan logo toko upload) */
export const PWA_ICON_PATHS = {
  icon192: "/icons/icon-192.png",
  icon512: "/icons/icon-512.png",
  apple: "/icons/apple-touch-icon.png",
  favicon: "/favicon-32.png",
} as const;

export function resolveStoreLogoUrl(logoUrl: string | null | undefined): string {
  return logoUrl || DEFAULT_LOGO;
}

/** URL icon PWA — selalu pakai brand app statis (identitas instalasi). */
export function getPwaIconUrls(_logoUrl?: string | null): {
  icon192: string;
  icon512: string;
} {
  return {
    icon192: PWA_ICON_PATHS.icon192,
    icon512: PWA_ICON_PATHS.icon512,
  };
}
