import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { UserManagementClient } from "@/components/settings/user-management-client";
import { PageListSkeleton } from "@/components/shared/page-skeleton";
import {
  isManageUsersConfigured,
  listUsers,
  type UserRow,
} from "@/lib/users";

export function PengaturanUserPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const edgeConfigured = isManageUsersConfigured();

  const refresh = useCallback(async () => {
    const result = await listUsers();
    if (!result.success) {
      toast.error(result.message || "Gagal memuat user");
      setUsers([]);
    } else {
      setUsers(result.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageListSkeleton />
      </div>
    );
  }

  if (role !== "OWNER") {
    if (role === "GUDANG") return <Navigate to="/gudang/stok" replace />;
    return <Navigate to="/kasir" replace />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex gap-1 border-b border-border">
        <Link
          to="/pengaturan"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          Informasi Toko
        </Link>
        <Link
          to="/pengaturan/user"
          className="border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
        >
          Kelola User
        </Link>
      </div>

      <UserManagementClient
        users={users}
        currentUserId={user?.id || ""}
        onRefresh={refresh}
        edgeConfigured={edgeConfigured}
      />
    </div>
  );
}
