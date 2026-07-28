import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const configured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes("placeholder.supabase");

if (!configured) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum ada di build. Set Build variables di Cloudflare lalu Redeploy, atau pakai .env.local lokal."
  );
}

export const supabase = createClient(
  configured ? supabaseUrl : "https://placeholder.supabase.co",
  configured ? supabaseAnonKey : "placeholder",
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  }
);

export function isSupabaseConfigured(): boolean {
  return configured;
}
