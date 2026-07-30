// Deploy: supabase functions deploy apply-sale-stock --project-ref <ref>
// Secrets: SUPABASE_SERVICE_ROLE_KEY (URL/ANON otomatis di runtime)
//
// Body apply: { productId, warehouseId, qty, transactionId }
// Body restore: { action: "restore", transactionId }
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
    return json({ message: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ message: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ message: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body?.action === "restore") {
    const transactionId = body.transactionId as string | undefined;
    if (!transactionId) {
      return json({ message: "transactionId wajib" }, 400);
    }

    const { data: sales, error: listErr } = await admin
      .from("stock_movements")
      .select("product_id, from_warehouse_id, qty")
      .eq("reference_type", "transaction")
      .eq("reference_id", transactionId)
      .eq("type", "SALE");

    if (listErr) {
      return json({ message: listErr.message }, 400);
    }

    for (const m of sales || []) {
      const { error } = await admin.rpc("apply_stock_change", {
        p_type: "VOID_RESTORE",
        p_product_id: m.product_id,
        p_qty: m.qty,
        p_from_warehouse_id: null,
        p_to_warehouse_id: m.from_warehouse_id,
        p_note: "Restore gagal simpan transaksi SPA",
        p_reference_type: "transaction",
        p_reference_id: transactionId,
        p_created_by: user.id,
      });
      if (error) {
        return json({ message: `Gagal restore stok: ${error.message}` }, 400);
      }
    }

    return json({ success: true, restored: (sales || []).length });
  }

  const productId = body?.productId as string | undefined;
  const warehouseId = body?.warehouseId as string | undefined;
  const qty = Number(body?.qty);
  const transactionId = body?.transactionId as string | undefined;

  if (!productId || !warehouseId || !transactionId || !Number.isFinite(qty) || qty <= 0) {
    return json({ message: "Payload tidak lengkap" }, 400);
  }

  const { error } = await admin.rpc("apply_stock_change", {
    p_type: "SALE",
    p_product_id: productId,
    p_from_warehouse_id: warehouseId,
    p_to_warehouse_id: null,
    p_qty: qty,
    p_note: "Penjualan kasir",
    p_reference_type: "transaction",
    p_reference_id: transactionId,
    p_created_by: user.id,
  });

  if (error) {
    return json({ message: error.message }, 400);
  }

  return json({ success: true });
});
