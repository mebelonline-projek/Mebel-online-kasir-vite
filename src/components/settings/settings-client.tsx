import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreLogo } from "@/components/shared/store-logo";
import { useAuth } from "@/contexts/auth-context";
import { useStore } from "@/contexts/store-context";
import {
  resetLogo,
  updateStoreSettings,
  uploadLogo,
  type StoreSettings,
} from "@/lib/settings";

interface Props {
  settings: StoreSettings | null;
  profileRole: string;
}

export function SettingsClient({ settings, profileRole }: Props) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { setStoreLogo, setStoreName, refreshStore } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOwner = profileRole === "OWNER";

  const [storeName, setStoreNameLocal] = useState(settings?.store_name || "");
  const [address, setAddress] = useState(settings?.address || "");
  const [phone, setPhone] = useState(settings?.phone || "");
  const [logoUrl, setLogoUrl] = useState<string | null>(settings?.logo_url ?? null);
  const [settingsId] = useState(settings?.id || "");

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const handleSave = async () => {
    if (!storeName || storeName.trim().length < 3) {
      toast.error("Nama toko minimal 3 karakter");
      return;
    }
    if (!settingsId) {
      toast.error("Data pengaturan tidak ditemukan");
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateStoreSettings({
        id: settingsId,
        store_name: storeName,
        address,
        phone,
      });

      if (result.success) {
        toast.success(result.message || "Pengaturan toko berhasil disimpan");
        setStoreName(storeName.trim());
      } else {
        toast.error(result.message || "Gagal menyimpan pengaturan");
      }
    } catch {
      toast.error("Gagal menyimpan pengaturan toko");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipe file harus PNG, JPG, atau WebP");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 2MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadLogo(file);
      if (result.success && result.data?.logo_url) {
        toast.success("Logo berhasil diupload");
        setLogoUrl(result.data.logo_url);
        setStoreLogo(result.data.logo_url);
        await refreshStore();
      } else {
        toast.error(result.message || "Gagal upload logo");
      }
    } catch {
      toast.error("Gagal upload logo");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleResetLogo = async () => {
    setIsResetting(true);
    try {
      const result = await resetLogo();
      if (result.success) {
        toast.success("Logo berhasil direset ke default");
        setResetDialogOpen(false);
        setLogoUrl(null);
        setStoreLogo(null);
        await refreshStore();
      } else {
        toast.error(result.message || "Gagal mereset logo");
      }
    } catch {
      toast.error("Gagal mereset logo");
    } finally {
      setIsResetting(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="gap-1.5 text-destructive hover:text-destructive"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold mb-4">Logo Toko</h2>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <StoreLogo src={logoUrl} alt="Logo Toko" size="xl" />

          <div className="space-y-3 flex-1">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUploadLogo}
                className="hidden"
                id="logo-upload"
                disabled={!isOwner || isUploading}
              />
              <label
                htmlFor="logo-upload"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                  isOwner
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {isUploading ? "Mengupload..." : "Upload Logo Baru"}
              </label>
              {!isOwner && (
                <p className="text-xs text-muted-foreground mt-1">
                  Hanya Owner yang bisa mengubah logo
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Format: PNG, JPG, atau WebP. Maksimal 2MB.
            </p>

            {isOwner && logoUrl && (
              <button
                type="button"
                onClick={() => setResetDialogOpen(true)}
                className="text-xs text-destructive hover:underline cursor-pointer"
              >
                Reset ke logo default
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold mb-4">Informasi Toko</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1.5">
              Nama Toko <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreNameLocal(e.target.value)}
              className="dark-input w-full"
              placeholder="Nama toko Anda"
              disabled={!isOwner}
            />
          </div>

          <div>
            <label className="block text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1.5">
              Alamat
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="dark-input w-full min-h-[80px] resize-y"
              placeholder="Alamat toko"
              disabled={!isOwner}
            />
          </div>

          <div>
            <label className="block text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1.5">
              Telepon
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="dark-input w-full"
              placeholder="Nomor telepon toko"
              disabled={!isOwner}
            />
          </div>

          {isOwner && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !storeName || storeName.trim().length < 3}
                className="btn-maroon cursor-pointer"
              >
                {isSaving ? "Menyimpan..." : "Simpan Pengaturan"}
              </button>
            </div>
          )}
        </div>
      </div>

      {resetDialogOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
          <div className="bg-card border border-border rounded-xl shadow-sm max-w-[420px] p-6 w-full">
            <h2 className="text-lg font-bold mb-2">Reset Logo</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Yakin ingin mereset logo ke default? Logo yang sudah diupload akan
              dihapus.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetDialogOpen(false)}
                className="btn-dark cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetLogo}
                disabled={isResetting}
                className="btn-maroon bg-destructive cursor-pointer"
              >
                {isResetting ? "Mereset..." : "Ya, Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
