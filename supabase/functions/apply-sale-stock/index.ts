// Deploy: supabase functions deploy apply-sale-stock --project-ref <ref>
// Secrets: SUPABASE_SERVICE_ROLE_KEY (URL/ANON otomatis di runtime)
//
// Body apply (SALE): { productId, warehouseId, qty, transactionId }
// Body restore: { action: "restore", transactionId }
// Body move: { action: "move", type: "IN"|"OUT"|"TRANSFER", productId, qty,
//              fromWarehouseId?, toWarehouseId?, note? }
// Body delete_movement: { action: "delete_movement", movementId }
// Body edit_movement: { action: "edit_movement", movementId, type, productId, qty,
//                       fromWarehouseId?, toWarehouseId?, note? }
// Header: Authorization Bearer <user JWT>

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ManualType = "IN" | "OUT" | "TRANSFER";

type MovementLike = {
  type: string;
  product_id: string | null;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  qty: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isManualType(t: string): t is ManualType {
  return t === "IN" || t === "OUT" || t === "TRANSFER";
}

function validateManualPayload(params: {
  type: string;
  productId: string | null | undefined;
  qty: number;
  fromId: string | null;
  toId: string | null;
}): string | null {
  const { type, productId, qty, fromId, toId } = params;
  if (!isManualType(type) || !productId || !Number.isFinite(qty) || qty <= 0) {
    return "Payload mutasi tidak lengkap";
  }
  if (type === "IN" && !toId) return "Pilih gudang tujuan";
  if (type === "OUT" && !fromId) return "Pilih gudang asal";
  if (type === "TRANSFER") {
    if (!fromId || !toId) return "Pilih gudang asal dan tujuan";
    if (fromId === toId) return "Gudang asal dan tujuan harus berbeda";
  }
  return null;
}

/** Δ stock at warehouse; negative deducts (needs enough qty). */
async function adjustStock(
  admin: SupabaseClient,
  productId: string,
  warehouseId: string,
  delta: number
): Promise<string | null> {
  if (!warehouseId || delta === 0) return null;

  const { error: upsertErr } = await admin.from("warehouse_stocks").upsert(
    { warehouse_id: warehouseId, product_id: productId, qty: 0 },
    { onConflict: "warehouse_id,product_id", ignoreDuplicates: true }
  );
  if (upsertErr) return upsertErr.message;

  const { data: row, error: readErr } = await admin
    .from("warehouse_stocks")
    .select("qty")
    .eq("warehouse_id", warehouseId)
    .eq("product_id", productId)
    .maybeSingle();

  if (readErr) return readErr.message;
  const current = Number(row?.qty ?? 0);
  const next = current + delta;
  if (next < 0) {
    return "Stok tidak cukup untuk koreksi mutasi ini";
  }

  const { error: updErr } = await admin
    .from("warehouse_stocks")
    .update({ qty: next })
    .eq("warehouse_id", warehouseId)
    .eq("product_id", productId);

  return updErr ? updErr.message : null;
}

/** Undo effect of a manual movement on warehouse_stocks (no new log row). */
async function reverseManualStock(
  admin: SupabaseClient,
  m: MovementLike
): Promise<string | null> {
  if (!m.product_id || !Number.isFinite(m.qty) || m.qty <= 0) {
    return "Data mutasi tidak valid";
  }
  if (m.type === "IN") {
    if (!m.to_warehouse_id) return "Gudang tujuan mutasi tidak valid";
    return adjustStock(admin, m.product_id, m.to_warehouse_id, -m.qty);
  }
  if (m.type === "OUT") {
    if (!m.from_warehouse_id) return "Gudang asal mutasi tidak valid";
    return adjustStock(admin, m.product_id, m.from_warehouse_id, m.qty);
  }
  if (m.type === "TRANSFER") {
    if (!m.from_warehouse_id || !m.to_warehouse_id) {
      return "Gudang mutasi pindah tidak valid";
    }
    const errTo = await adjustStock(
      admin,
      m.product_id,
      m.to_warehouse_id,
      -m.qty
    );
    if (errTo) return errTo;
    const errFrom = await adjustStock(
      admin,
      m.product_id,
      m.from_warehouse_id,
      m.qty
    );
    if (errFrom) {
      // best-effort re-apply to side
      await adjustStock(admin, m.product_id, m.to_warehouse_id, m.qty);
      return errFrom;
    }
    return null;
  }
  return "Tipe mutasi tidak bisa dikoreksi di sini";
}

/** Apply effect of a manual movement on warehouse_stocks (no new log row). */
async function applyManualStock(
  admin: SupabaseClient,
  m: MovementLike
): Promise<string | null> {
  if (!m.product_id || !Number.isFinite(m.qty) || m.qty <= 0) {
    return "Data mutasi tidak valid";
  }
  if (m.type === "IN") {
    if (!m.to_warehouse_id) return "Gudang tujuan wajib";
    return adjustStock(admin, m.product_id, m.to_warehouse_id, m.qty);
  }
  if (m.type === "OUT") {
    if (!m.from_warehouse_id) return "Gudang asal wajib";
    return adjustStock(admin, m.product_id, m.from_warehouse_id, -m.qty);
  }
  if (m.type === "TRANSFER") {
    if (!m.from_warehouse_id || !m.to_warehouse_id) {
      return "Gudang asal dan tujuan wajib";
    }
    const errFrom = await adjustStock(
      admin,
      m.product_id,
      m.from_warehouse_id,
      -m.qty
    );
    if (errFrom) return errFrom;
    const errTo = await adjustStock(
      admin,
      m.product_id,
      m.to_warehouse_id,
      m.qty
    );
    if (errTo) {
      await adjustStock(admin, m.product_id, m.from_warehouse_id, m.qty);
      return errTo;
    }
    return null;
  }
  return "Tipe mutasi tidak valid";
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

    const validErr = validateManualPayload({
      type: type || "",
      productId,
      qty,
      fromId,
      toId,
    });
    if (validErr) return json({ message: validErr }, 400);

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

  if (body?.action === "delete_movement") {
    if (!role || (role !== "OWNER" && role !== "GUDANG")) {
      return json(
        { message: "Hanya Owner atau Gudang yang bisa hapus riwayat mutasi" },
        403
      );
    }

    const movementId = body.movementId as string | undefined;
    if (!movementId) {
      return json({ message: "movementId wajib" }, 400);
    }

    const { data: movement, error: readErr } = await admin
      .from("stock_movements")
      .select(
        "id, type, product_id, from_warehouse_id, to_warehouse_id, qty"
      )
      .eq("id", movementId)
      .maybeSingle();

    if (readErr) return json({ message: readErr.message }, 400);
    if (!movement) {
      return json({ message: "Riwayat mutasi tidak ditemukan" }, 404);
    }
    if (!isManualType(movement.type)) {
      return json(
        {
          message:
            "Mutasi penjualan/batal tidak bisa dihapus di sini. Batalkan lewat transaksi.",
        },
        400
      );
    }

    const revErr = await reverseManualStock(admin, {
      type: movement.type,
      product_id: movement.product_id,
      from_warehouse_id: movement.from_warehouse_id,
      to_warehouse_id: movement.to_warehouse_id,
      qty: Number(movement.qty),
    });
    if (revErr) return json({ message: revErr }, 400);

    const { error: delErr } = await admin
      .from("stock_movements")
      .delete()
      .eq("id", movementId);

    if (delErr) {
      // best-effort re-apply so stock matches remaining log
      await applyManualStock(admin, {
        type: movement.type,
        product_id: movement.product_id,
        from_warehouse_id: movement.from_warehouse_id,
        to_warehouse_id: movement.to_warehouse_id,
        qty: Number(movement.qty),
      });
      return json({ message: delErr.message }, 400);
    }

    return json({ success: true });
  }

  if (body?.action === "edit_movement") {
    if (!role || (role !== "OWNER" && role !== "GUDANG")) {
      return json(
        { message: "Hanya Owner atau Gudang yang bisa edit riwayat mutasi" },
        403
      );
    }

    const movementId = body.movementId as string | undefined;
    if (!movementId) {
      return json({ message: "movementId wajib" }, 400);
    }

    const type = body.type as string | undefined;
    const productId = body.productId as string | undefined;
    const qty = Number(body.qty);
    const fromId = (body.fromWarehouseId as string | null | undefined) || null;
    const toId = (body.toWarehouseId as string | null | undefined) || null;
    const note = (body.note as string | null | undefined)?.trim() || null;

    const validErr = validateManualPayload({
      type: type || "",
      productId,
      qty,
      fromId,
      toId,
    });
    if (validErr) return json({ message: validErr }, 400);

    const { data: old, error: readErr } = await admin
      .from("stock_movements")
      .select(
        "id, type, product_id, from_warehouse_id, to_warehouse_id, qty"
      )
      .eq("id", movementId)
      .maybeSingle();

    if (readErr) return json({ message: readErr.message }, 400);
    if (!old) {
      return json({ message: "Riwayat mutasi tidak ditemukan" }, 404);
    }
    if (!isManualType(old.type)) {
      return json(
        {
          message:
            "Mutasi penjualan/batal tidak bisa diedit di sini. Batalkan lewat transaksi.",
        },
        400
      );
    }

    const oldLike: MovementLike = {
      type: old.type,
      product_id: old.product_id,
      from_warehouse_id: old.from_warehouse_id,
      to_warehouse_id: old.to_warehouse_id,
      qty: Number(old.qty),
    };
    const newLike: MovementLike = {
      type: type as ManualType,
      product_id: productId!,
      from_warehouse_id: type === "IN" ? null : fromId,
      to_warehouse_id: type === "OUT" ? null : toId,
      qty,
    };

    const revErr = await reverseManualStock(admin, oldLike);
    if (revErr) return json({ message: revErr }, 400);

    const appErr = await applyManualStock(admin, newLike);
    if (appErr) {
      await applyManualStock(admin, oldLike);
      return json({ message: appErr }, 400);
    }

    const { error: updErr } = await admin
      .from("stock_movements")
      .update({
        type: newLike.type,
        product_id: newLike.product_id,
        from_warehouse_id: newLike.from_warehouse_id,
        to_warehouse_id: newLike.to_warehouse_id,
        qty: newLike.qty,
        note,
      })
      .eq("id", movementId);

    if (updErr) {
      await reverseManualStock(admin, newLike);
      await applyManualStock(admin, oldLike);
      return json({ message: updErr.message }, 400);
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
