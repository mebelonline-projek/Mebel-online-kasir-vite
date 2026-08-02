// Deploy: supabase functions deploy apply-sale-stock --project-ref <ref>
// Secrets: SUPABASE_SERVICE_ROLE_KEY (URL/ANON otomatis di runtime)
//
// Body apply (SALE): { productId, warehouseId, qty, transactionId }
// Body restore: { action: "restore", transactionId }
// Body move: { action: "move", type: "IN"|"OUT"|"TRANSFER", productId, qty,
//              fromWarehouseId?, toWarehouseId?, note? }
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

  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role as string | undefined;

  if (body?.action === "restore") {
    const transactionId = body.transactionId as string | undefined;
    if (!transactionId) {
      return json({ message: "transactionId wajib" }, 400);
    }

    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .select("id, created_by")
      .eq("id", transactionId)
      .maybeSingle();

    if (txErr) {
      return json({ message: txErr.message }, 400);
    }
    if (!tx) {
      return json({ message: "Transaksi tidak ditemukan" }, 400);
    }

    // OWNER: void/hapus. Creator: rollback gagal simpan kasir (KARYAWAN).
    if (role !== "OWNER" && tx.created_by !== user.id) {
      return json(
        { message: "Tidak diizinkan mengembalikan stok transaksi ini" },
        403
      );
    }

    const { data: already, error: alreadyErr } = await admin
      .from("stock_movements")
      .select("id")
      .eq("reference_type", "transaction")
      .eq("reference_id", transactionId)
      .eq("type", "VOID_RESTORE")
      .limit(1);

    if (alreadyErr) {
      return json({ message: alreadyErr.message }, 400);
    }
    if (already && already.length > 0) {
      return json({ success: true, restored: 0, skipped: true });
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
        p_note: "Restore stok transaksi",
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

  if (body?.action === "move") {
    if (!role || (role !== "OWNER" && role !== "GUDANG")) {
      return json(
        { message: "Hanya Owner atau Gudang yang bisa mutasi stok" },
        403
      );
    }

    const type = body.type as string | undefined;
    const productId = body.productId as string | undefined;
    const qty = Number(body.qty);
    const fromId = (body.fromWarehouseId as string | null | undefined) || null;
    const toId = (body.toWarehouseId as string | null | undefined) || null;
    const note = (body.note as string | null | undefined)?.trim() || null;
    const referenceType =
      (body.referenceType as string | null | undefined) || null;
    const referenceId =
      (body.referenceId as string | null | undefined) || null;

    if (
      !type ||
      !["IN", "OUT", "TRANSFER"].includes(type) ||
      !productId ||
      !Number.isFinite(qty) ||
      qty <= 0
    ) {
      return json({ message: "Payload mutasi tidak lengkap" }, 400);
    }

    if (type === "IN" && !toId) {
      return json({ message: "Pilih gudang tujuan" }, 400);
    }
    if (type === "OUT" && !fromId) {
      return json({ message: "Pilih gudang asal" }, 400);
    }
    if (type === "TRANSFER") {
      if (!fromId || !toId) {
        return json({ message: "Pilih gudang asal dan tujuan" }, 400);
      }
      if (fromId === toId) {
        return json(
          { message: "Gudang asal dan tujuan harus berbeda" },
          400
        );
      }
    }

    const { error } = await admin.rpc("apply_stock_change", {
      p_type: type,
      p_product_id: productId,
      p_qty: qty,
      p_from_warehouse_id: type === "IN" ? null : fromId,
      p_to_warehouse_id: type === "OUT" ? null : toId,
      p_note: note,
      p_reference_type: referenceType,
      p_reference_id: referenceId,
      p_created_by: user.id,
    });

    if (error) {
      return json({ message: error.message }, 400);
    }

    return json({ success: true });
  }

  // Default: SALE (potong stok kasir)
  if (!role || (role !== "OWNER" && role !== "KARYAWAN")) {
    return json(
      { message: "Hanya Owner atau Karyawan yang bisa potong stok penjualan" },
      403
    );
  }

  const productId = body?.productId as string | undefined;
  const warehouseId = body?.warehouseId as string | undefined;
  const qty = Number(body?.qty);
  const transactionId = body?.transactionId as string | undefined;

  if (
    !productId ||
    !warehouseId ||
    !transactionId ||
    !Number.isFinite(qty) ||
    qty <= 0
  ) {
    return json({ message: "Payload tidak lengkap" }, 400);
  }

  const { data: tx, error: txErr } = await admin
    .from("transactions")
    .select("id, status")
    .eq("id", transactionId)
    .maybeSingle();

  if (txErr) {
    return json({ message: txErr.message }, 400);
  }
  if (!tx) {
    return json({ message: "Transaksi tidak ditemukan" }, 400);
  }
  if (tx.status === "BATAL") {
    return json({ message: "Tidak bisa potong stok transaksi batal" }, 400);
  }

  const { data: matchingItems, error: itemsErr } = await admin
    .from("transaction_items")
    .select("id")
    .eq("transaction_id", transactionId)
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId)
    .eq("quantity", qty);

  if (itemsErr) {
    return json({ message: itemsErr.message }, 400);
  }
  if (!matchingItems || matchingItems.length === 0) {
    return json(
      { message: "Item stok tidak cocok dengan transaksi" },
      400
    );
  }

  const { count: saleCount, error: saleCountErr } = await admin
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("reference_type", "transaction")
    .eq("reference_id", transactionId)
    .eq("type", "SALE")
    .eq("product_id", productId)
    .eq("from_warehouse_id", warehouseId)
    .eq("qty", qty);

  if (saleCountErr) {
    return json({ message: saleCountErr.message }, 400);
  }
  if ((saleCount ?? 0) >= matchingItems.length) {
    return json(
      { message: "Stok sudah dipotong untuk item ini" },
      400
    );
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
