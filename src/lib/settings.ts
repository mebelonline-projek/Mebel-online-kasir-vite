import type { ActionState } from "@/types/common";
import { supabase } from "@/lib/supabase";
import {
  generatePwaIcon,
  processStoreLogo,
} from "@/lib/image-process";

export type StoreSettings = {
  id: string;
  store_name: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  updated_at: string | null;
};

async function requireOwner(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Silakan login terlebih dahulu" };

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "OWNER") {
    return { ok: false, message: "Hanya Owner yang bisa mengubah pengaturan toko" };
  }
  return { ok: true, userId: user.id };
}

export async function getStoreSettings(): Promise<StoreSettings | null> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("id, store_name, address, phone, logo_url, updated_at")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as StoreSettings;
}

export async function updateStoreSettings(input: {
  id: string;
  store_name: string;
  address: string;
  phone: string;
}): Promise<ActionState<StoreSettings>> {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const storeName = input.store_name.trim();
    if (storeName.length < 3) {
      return { success: false, message: "Nama toko minimal 3 karakter" };
    }

    const { data, error } = await supabase
      .from("store_settings")
      .update({
        store_name: storeName,
        address: input.address.trim() || null,
        phone: input.phone.trim() || null,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .select("id, store_name, address, phone, logo_url, updated_at")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal menyimpan pengaturan toko");

    return {
      success: true,
      message: "Pengaturan toko berhasil disimpan",
      data: data as StoreSettings,
    };
  } catch (error: unknown) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Gagal menyimpan pengaturan toko",
    };
  }
}

export async function uploadLogo(file: File): Promise<ActionState<{ logo_url: string }>> {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      return { success: false, message: "Tipe file harus PNG, JPG, atau WebP" };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { success: false, message: "Ukuran file maksimal 2MB" };
    }

    const current = await getStoreSettings();
    if (!current) return { success: false, message: "Pengaturan toko tidak ditemukan" };

    if (current.logo_url) {
      const fromStorage =
        current.logo_url.includes("supabase") ||
        current.logo_url.includes("/logos/");
      if (fromStorage) {
        const oldPath = current.logo_url.split("/logos/").pop();
        if (oldPath) await supabase.storage.from("logos").remove([oldPath]);
      }
    }

    const webp = await processStoreLogo(file);
    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload("logo.webp", webp, {
        contentType: webp.type || "image/webp",
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage.from("logos").getPublicUrl("logo.webp");
    const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("store_settings")
      .update({
        logo_url: logoUrl,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (updateError) throw new Error(updateError.message);

    try {
      const [icon192, icon512] = await Promise.all([
        generatePwaIcon(webp, 192),
        generatePwaIcon(webp, 512),
      ]);
      await Promise.all([
        supabase.storage.from("logos").upload("pwa/icon-192.png", icon192, {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: true,
        }),
        supabase.storage.from("logos").upload("pwa/icon-512.png", icon512, {
          contentType: "image/png",
          cacheControl: "3600",
          upsert: true,
        }),
      ]);
    } catch {
      // Ikon PWA opsional — logo utama sudah tersimpan
    }

    return {
      success: true,
      message: "Logo berhasil diupload",
      data: { logo_url: logoUrl },
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Gagal upload logo",
    };
  }
}

export async function resetLogo(): Promise<ActionState> {
  try {
    const auth = await requireOwner();
    if (!auth.ok) return { success: false, message: auth.message };

    const current = await getStoreSettings();
    if (!current) return { success: false, message: "Pengaturan toko tidak ditemukan" };

    if (
      current.logo_url &&
      !current.logo_url.includes("logo.svg") &&
      !current.logo_url.includes("logo.png")
    ) {
      const oldPath = current.logo_url.split("/logos/").pop();
      if (oldPath) await supabase.storage.from("logos").remove([oldPath]);
    }

    await supabase.storage
      .from("logos")
      .remove(["pwa/icon-192.png", "pwa/icon-512.png"]);

    const { error } = await supabase
      .from("store_settings")
      .update({
        logo_url: null,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    if (error) throw new Error(error.message);
    return { success: true, message: "Logo berhasil direset ke default" };
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Gagal mereset logo",
    };
  }
}
