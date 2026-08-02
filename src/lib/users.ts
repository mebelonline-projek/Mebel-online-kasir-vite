import type { ActionState } from "@/types/common";
import { supabase } from "@/lib/supabase";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "KARYAWAN" | "GUDANG";
  created_at: string;
};

function manageUsersUrl(): string | null {
  return (
    (import.meta.env.VITE_EDGE_MANAGE_USERS_URL as string | undefined)?.trim() ||
    null
  );
}

/** List user: langsung DB (OWNER full access via RLS). Tidak butuh Edge. */
export async function listUsers(): Promise<ActionState<UserRow[]>> {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, name, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, message: error.message };
  }
  return { success: true, data: (data || []) as UserRow[] };
}

async function callManageUsersEdge(
  body: Record<string, unknown>
): Promise<ActionState> {
  const url = manageUsersUrl();
  if (!url) {
    return {
      success: false,
      message:
        "Tambah/ubah/hapus user butuh Edge manage-users. Set VITE_EDGE_MANAGE_USERS_URL dulu.",
    };
  }

  const anonKey = (
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  )?.trim();
  if (!anonKey) {
    return {
      success: false,
      message: "VITE_SUPABASE_ANON_KEY belum dikonfigurasi",
    };
  }

  // Refresh jika hampir expired agar gateway verify_jwt tidak tolak JWT basi
  let {
    data: { session },
  } = await supabase.auth.getSession();
  const expiresAt = session?.expires_at ?? 0;
  if (session && expiresAt * 1000 < Date.now() + 60_000) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session ?? session;
  }
  if (!session?.access_token) {
    return { success: false, message: "Silakan login terlebih dahulu" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify(body),
  });

  let result: ActionState;
  try {
    result = await res.json();
  } catch {
    return {
      success: false,
      message: `Gagal (HTTP ${res.status}). Coba lagi.`,
    };
  }

  if (!res.ok && !result.message) {
    return {
      success: false,
      message: `Gagal (HTTP ${res.status})`,
    };
  }
  return result;
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  role: "KARYAWAN" | "GUDANG";
}): Promise<ActionState> {
  return callManageUsersEdge({ action: "create", ...input });
}

export async function updateUser(
  id: string,
  input: {
    name: string;
    role: "KARYAWAN" | "GUDANG";
    password?: string;
  }
): Promise<ActionState> {
  return callManageUsersEdge({
    action: "update",
    id,
    name: input.name,
    role: input.role,
    password: input.password,
  });
}

export async function deleteUser(id: string): Promise<ActionState> {
  return callManageUsersEdge({ action: "delete", id });
}

export function isManageUsersConfigured(): boolean {
  return Boolean(manageUsersUrl());
}
