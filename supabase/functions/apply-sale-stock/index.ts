// Edge Function stub — deploy ke Supabase (bukan Cloudflare Workers Free).
// Simpan SERVICE_ROLE hanya di secrets Supabase Functions.
//
// supabase functions deploy apply-sale-stock
//
// Body JSON: { productId, warehouseId, qty, transactionId }
// Header: Authorization Bearer <user JWT>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
    });
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
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
    });
  }

  const body = await req.json();
  const { productId, warehouseId, qty, transactionId } = body ?? {};
  if (!productId || !warehouseId || !qty || !transactionId) {
    return new Response(JSON.stringify({ message: "Payload tidak lengkap" }), {
      status: 400,
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.rpc("apply_stock_change", {
    p_type: "SALE",
    p_product_id: productId,
    p_from_warehouse_id: warehouseId,
    p_to_warehouse_id: null,
    p_qty: qty,
    p_note: `sale:${transactionId}`,
    p_created_by: user.id,
    p_reference_id: transactionId,
  });

  if (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: 400,
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
