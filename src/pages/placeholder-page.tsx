export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">
        Modul ini menyusul setelah Auth + Kasir + offline terbukti di staging.
      </p>
    </div>
  );
}
