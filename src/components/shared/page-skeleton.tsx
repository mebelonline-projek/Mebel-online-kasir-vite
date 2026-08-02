/** Generic list/table loading chrome — no page padding (AppShell pads). */
export function PageListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-muted" />
        <div className="h-4 w-64 rounded-lg bg-muted/60" />
      </div>
      <div className="h-10 w-full max-w-sm rounded-lg bg-muted/50" />
      <div className="space-y-3 rounded-xl border border-border p-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="h-5 flex-1 rounded bg-muted/50" />
            <div className="h-5 w-20 rounded bg-muted/40" />
            <div className="h-5 w-16 rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PengaturanSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse" aria-hidden>
      <div className="mb-6">
        <div className="h-9 w-52 rounded-lg bg-muted" />
        <div className="mt-2 h-4 w-64 rounded-lg bg-muted/60" />
      </div>
      <div className="space-y-8">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 h-6 w-28 rounded-lg bg-muted" />
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="h-32 w-32 rounded-xl bg-muted/50" />
            <div className="space-y-3">
              <div className="h-10 w-36 rounded-lg bg-muted" />
              <div className="h-3 w-48 rounded-lg bg-muted/60" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 h-6 w-32 rounded-lg bg-muted" />
          <div className="space-y-4">
            <div className="h-10 w-full rounded-lg bg-muted/50" />
            <div className="h-20 w-full rounded-lg bg-muted/50" />
            <div className="h-10 w-full rounded-lg bg-muted/50" />
            <div className="h-10 w-44 rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-hidden>
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-2">
          <div className="h-10 w-56 rounded-lg bg-muted" />
          <div className="h-5 w-64 rounded-lg bg-muted/60" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-36 rounded bg-muted" />
          <div className="h-9 w-36 rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="glass-panel flex flex-col justify-between p-5"
            style={{ height: 160 }}
          >
            <div>
              <div className="mb-2 h-3 w-28 rounded bg-muted" />
              <div className="mt-1 h-8 w-44 rounded bg-muted" />
            </div>
            <div className="h-4 w-20 rounded bg-muted/60" />
          </div>
        ))}
      </div>
      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border p-6">
          <div className="h-6 w-48 rounded bg-muted" />
          <div className="h-4 w-36 rounded bg-muted/60" />
        </div>
        <div className="space-y-4 p-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="h-5 w-36 rounded bg-muted/50" />
              <div className="h-5 w-28 rounded bg-muted/40" />
              <div className="h-5 w-20 rounded bg-muted/40" />
              <div className="h-5 w-24 rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TransaksiDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse space-y-6" aria-hidden>
      <div className="h-4 w-32 rounded bg-muted/60" />
      <div className="h-8 w-72 rounded-lg bg-muted" />
      <div className="space-y-4 rounded-xl border border-border p-6">
        <div className="flex justify-between">
          <div className="h-5 w-40 rounded bg-muted/50" />
          <div className="h-6 w-24 rounded-full bg-muted" />
        </div>
        <div className="h-5 w-56 rounded bg-muted/50" />
        <div className="h-5 w-48 rounded bg-muted/50" />
        <div className="h-5 w-64 rounded bg-muted/50" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border p-4">
            <div className="mb-2 h-3 w-24 rounded bg-muted/60" />
            <div className="h-7 w-32 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <div className="h-10 w-24 rounded-lg bg-muted" />
        <div className="h-10 w-32 rounded-lg bg-muted" />
        <div className="h-10 w-24 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
