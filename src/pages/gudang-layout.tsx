import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { GudangShell } from "@/components/inventory/gudang-shell";

export function GudangLayout() {
  const { role } = useAuth();

  if (role !== "OWNER" && role !== "GUDANG") {
    return <Navigate to="/kasir" replace />;
  }

  return (
    <GudangShell>
      <Outlet />
    </GudangShell>
  );
}
