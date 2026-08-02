interface Props {
  data: number[];
  /** Arah tren: positif = naik, negatif = turun, 0 = flat */
  trend: number;
  className?: string;
  width?: number;
  height?: number;
}

export function Sparkline({ data, trend, className = "", width = 80, height = 28 }: Props) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const pathD = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height * 0.85 - height * 0.075;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaD = `${pathD} L${(data.length - 1) * stepX},${height} L0,${height} Z`;

  const fillColor =
    trend > 0
      ? "fill-emerald-500/10 dark:fill-emerald-400/10"
      : trend < 0
        ? "fill-destructive/10"
        : "fill-muted-foreground/10";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={areaD} className={fillColor} />
      <path
        d={pathD}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      />
    </svg>
  );
}
