import { StoreLogo } from "@/components/shared/store-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDashboardHref, useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { loginSchema } from "@/lib/validation";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function LoginPage() {
  const navigate = useNavigate();
  const { configured, refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const storeName = "Mebel Online Monitoring";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Validasi gagal");
      return;
    }
    if (!configured) {
      setError("Supabase belum dikonfigurasi (.env.local)");
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword(
      parsed.data
    );
    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    await refreshProfile();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = user
      ? await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()
      : { data: null };

    setLoading(false);
    navigate(getDashboardHref(profile?.role ?? null), { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="glass-panel w-full max-w-sm space-y-6 p-8">
        <div className="space-y-3 text-center">
          <div className="flex justify-center">
            <StoreLogo alt={storeName} size="xl" className="shadow-lg" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-primary dark:neon-title">
            {storeName}
          </h1>
          <p className="text-sm text-muted-foreground">Masuk ke akun Anda</p>
        </div>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Email
            </label>
            <Input
              type="email"
              placeholder="contoh@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="........"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label={
                  showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"
                }
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Memproses..." : "Masuk"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Butuh akun baru? Minta Owner menambahkan di Pengaturan → User.
        </p>
      </div>
    </div>
  );
}
