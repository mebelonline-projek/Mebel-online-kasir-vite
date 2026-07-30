import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_LOGO, resolveStoreLogoUrl } from "@/lib/store-logo";

const SIZE_CLASS = {
  xs: "w-8 h-8",
  sm: "w-10 h-10",
  md: "w-14 h-14",
  lg: "w-20 h-20",
  xl: "w-28 h-28",
} as const;

const RADIUS_CLASS = {
  xs: "rounded-lg",
  sm: "rounded-xl",
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
} as const;

type StoreLogoSize = keyof typeof SIZE_CLASS;

interface StoreLogoProps {
  src?: string | null;
  alt?: string;
  size?: StoreLogoSize;
  className?: string;
}

export function StoreLogo({
  src,
  alt = "Logo toko",
  size = "md",
  className,
}: StoreLogoProps) {
  const [imgSrc, setImgSrc] = useState(() => resolveStoreLogoUrl(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImgSrc(resolveStoreLogoUrl(src));
    setFailed(false);
  }, [src]);

  const resolved = failed ? DEFAULT_LOGO : imgSrc;
  const isBrandDefault =
    resolved === DEFAULT_LOGO || resolved.startsWith("/logo.");

  const frameClass = isBrandDefault
    ? "shadow-md ring-1 ring-primary/20 dark:ring-primary/30"
    : "border-2 border-primary/25 bg-gradient-to-br from-background via-muted/30 to-primary/5 shadow-md ring-1 ring-primary/10 dark:from-sidebar-accent/20 dark:to-primary/10";

  return (
    <div
      className={cn(
        "relative flex flex-shrink-0 overflow-hidden",
        SIZE_CLASS[size],
        RADIUS_CLASS[size],
        frameClass,
        className
      )}
    >
      <img
        src={resolved}
        alt={alt}
        className="h-full w-full object-cover"
        onError={() => {
          if (!failed) {
            setFailed(true);
            setImgSrc(DEFAULT_LOGO);
          }
        }}
      />
    </div>
  );
}
