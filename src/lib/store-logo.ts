/** Logo default brand */
export const DEFAULT_LOGO = "/logo.png";

export function resolveStoreLogoUrl(logoUrl: string | null | undefined): string {
  return logoUrl || DEFAULT_LOGO;
}
