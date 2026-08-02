// Deploy: supabase functions deploy manage-users --project-ref <ref>
// Secrets: SUPABASE_SERVICE_ROLE_KEY (URL/ANON otomatis di runtime)
//
// Body: { action: "list"|"create"|"update"|"delete", ... }
// Header: Authorization Bearer <user JWT>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ success: false, message: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!serviceKey) {
    return json(
      {
        success: false,
        message: "SUPABASE_SERVICE_ROLE_KEY belum di-set di Edge secrets",
      },
      500
    );
  }

  // Pola sama dengan apply-sale-stock yang sudah jalan
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json(
      {
        success: false,
        message: userError?.message || "Unauthorized",
      },
      401
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "OWNER") {
    return json(
      { success: false, message: "Hanya Owner yang bisa mengelola user" },
      403
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  if (action === "list") {
    const { data, error } = await admin
      .from("users")
      .select("id, email, name, role, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      return json({ success: false, message: error.message }, 400);
    }
    return json({ success: true, data: data || [] });
  }

  if (action === "create") {
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const role = body.role === "GUDANG" ? "GUDANG" : "KARYAWAN";

    if (!email.includes("@")) {
      return json({ success: false, message: "Email tidak valid" }, 400);
    }
    if (password.length < 6) {
      return json(
        { success: false, message: "Password minimal 6 karakter" },
        400
      );
    }
    if (name.length < 2) {
      return json({ success: false, message: "Nama minimal 2 karakter" }, 400);
    }

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role },
      });

    if (authError || !authData.user) {
      return json(
        { success: false, message: authError?.message || "Gagal buat auth user" },
        400
      );
    }

    const { error: insertError } = await admin.from("users").insert({
      id: authData.user.id,
      email,
      name,
      role,
    });

    if (insertError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      return json(
        {
          success: false,
          message: `Gagal membuat profil: ${insertError.message}`,
        },
        400
      );
    }

    return json({
      success: true,
      message: `User "${name}" berhasil ditambahkan sebagai ${role}`,
    });
  }

  if (action === "update") {
    const id = String(body.id || "");
    const name = String(body.name || "").trim();
    const role = body.role === "GUDANG" ? "GUDANG" : "KARYAWAN";
    const password =
      typeof body.password === "string" && body.password.trim()
        ? body.password.trim()
        : "";

    if (!id) {
      return json({ success: false, message: "ID user wajib" }, 400);
    }
    if (id === user.id) {
      return json(
        { success: false, message: "Tidak bisa mengubah akun Anda sendiri" },
        400
      );
    }
    if (name.length < 2) {
      return json({ success: false, message: "Nama minimal 2 karakter" }, 400);
    }
    if (password && password.length < 6) {
      return json(
        { success: false, message: "Password minimal 6 karakter" },
        400
      );
    }

    const { data: targetUser, error: targetError } = await admin
      .from("users")
      .select("id, name, role")
      .eq("id", id)
      .maybeSingle();

    if (targetError || !targetUser) {
      return json({ success: false, message: "User tidak ditemukan" }, 400);
    }
    if (targetUser.role === "OWNER") {
      return json(
        { success: false, message: "Tidak bisa mengubah akun Owner lain" },
        400
      );
    }

    const { error } = await admin
      .from("users")
      .update({ name, role })
      .eq("id", id);
    if (error) {
      return json({ success: false, message: error.message }, 400);
    }

    const { error: metaError } = await admin.auth.admin.updateUserById(id, {
      user_metadata: { name, role },
    });
    if (metaError) {
      return json(
        {
          success: false,
          message: `Profil tersimpan, tapi gagal sync Auth metadata: ${metaError.message}`,
        },
        400
      );
    }

    if (password) {
      const { error: pwError } = await admin.auth.admin.updateUserById(id, {
        password,
      });
      if (pwError) {
        return json(
          {
            success: false,
            message: `Profil tersimpan, tapi gagal ganti password: ${pwError.message}`,
          },
          400
        );
      }
    }

    return json({
      success: true,
      message: password
        ? "User berhasil diupdate (password diganti)"
        : "User berhasil diupdate",
    });
  }

  if (action === "delete") {
    const id = String(body.id || "");
    if (!id) {
      return json({ success: false, message: "ID user wajib" }, 400);
    }
    if (id === user.id) {
      return json(
        { success: false, message: "Tidak bisa menghapus akun Anda sendiri" },
        400
      );
    }

    const { data: targetUser, error: targetError } = await admin
      .from("users")
      .select("name, email, role")
      .eq("id", id)
      .maybeSingle();

    if (targetError || !targetUser) {
      return json({ success: false, message: "User tidak ditemukan" }, 400);
    }
    if (targetUser.role === "OWNER") {
      return json(
        { success: false, message: "Tidak bisa menghapus akun Owner" },
        400
      );
    }

    const { error: deleteError } = await admin.from("users").delete().eq("id", id);
    if (deleteError) {
      return json(
        {
          success: false,
          message: `Gagal menghapus user: ${deleteError.message}`,
        },
        400
      );
    }

    const { error: authError } = await admin.auth.admin.deleteUser(id);
    if (authError) {
      return json(
        {
          success: false,
          message: `User dihapus dari tabel tapi gagal dari Auth: ${authError.message}`,
        },
        400
      );
    }

    return json({
      success: true,
      message: `User "${targetUser.name}" berhasil dihapus`,
    });
  }

  return json(
    {
      success: false,
      message: "action tidak valid (list|create|update|delete)",
    },
    400
  );
});
