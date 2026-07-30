import { StoreLogo } from "@/components/shared/store-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { registerSchema } from "@/lib/validation";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Validasi gagal");
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { name: parsed.data.name, role: "OWNER" },
      },
    });

    if (signUpError || !data.user) {
      setLoading(false);
      setError(signUpError?.message || "Registrasi gagal");
      return;
    }

    const { error: profileError } = await supabase.from("users").upsert({
      id: data.user.id,
      name: parsed.data.name,
      email: parsed.data.email,
      role: "OWNER",
    });

    setLoading(false);
    if (profileError) {
      setError(
        "Akun dibuat, tetapi profil mungkin perlu disiapkan. Coba login."
      );
      return;
    }
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            <StoreLogo alt="Mebel Online" size="lg" className="shadow-md" />
          </div>
          <CardTitle className="font-serif text-2xl text-primary dark:neon-title">
            Daftar Owner
          </CardTitle>
          <CardDescription>
            Setup awal toko (staging / bootstrap). Produksi harian tetap Next
            sampai cutover.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Nama</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Memuat..." : "Daftar"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Sudah punya akun?{" "}
            <Link
              className="font-medium text-accent hover:underline"
              to="/login"
            >
              Masuk
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
