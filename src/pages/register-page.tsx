import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { registerSchema } from "@/lib/validation";

export function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "Validasi gagal");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { name: parsed.data.name, role: "OWNER" },
      },
    });

    if (error || !data.user) {
      setLoading(false);
      toast.error(error?.message || "Registrasi gagal");
      return;
    }

    // Profil biasanya dibuat lewat RPC create_user_profile / trigger.
    // Fallback insert self jika policy mengizinkan.
    const { error: profileError } = await supabase.from("users").upsert({
      id: data.user.id,
      name: parsed.data.name,
      email: parsed.data.email,
      role: "OWNER",
    });

    setLoading(false);
    if (profileError) {
      toast.message("Akun dibuat", {
        description:
          "Profil mungkin perlu dibuat via RPC staging. Coba login.",
      });
    } else {
      toast.success("Registrasi berhasil");
    }
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Daftar Owner</CardTitle>
          <p className="text-sm text-muted-foreground">
            Hanya untuk setup awal toko di staging
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="name">Nama</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
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
            <Link className="underline" to="/login">
              Masuk
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
