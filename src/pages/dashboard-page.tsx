import { useAuth } from "@/contexts/auth-context";

export function DashboardPage() {
  const { profile } = useAuth();

  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Dashboard Owner</h1>
      <p className="text-muted-foreground">
        Halo {profile?.name}. KPI & chart menyusul setelah kasir + offline stabil
        (Fase 4). Sementara pakai menu Kasir / Transaksi.
      </p>
    </div>
  );
}
