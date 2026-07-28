/**
 * Parse rupiah bulat dari input kasir.
 * Tolak pemisah ribuan ambigu (1.000.000 / 1,000,000) agar tidak salah parse.
 */
export function parseRupiahInteger(raw: string): {
  ok: true;
  value: number;
} | {
  ok: false;
  message: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: "Harga wajib diisi" };
  }

  // Hanya digit (opsional satu desimal titik/koma di akhir tidak diizinkan untuk rupiah kasir)
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      message: "Ketik angka bulat tanpa titik/koma (contoh: 1000000)",
    };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: "Harga harus lebih dari 0" };
  }

  const rounded = Math.round(value);
  if (rounded !== value || !Number.isSafeInteger(rounded)) {
    return { ok: false, message: "Harga tidak valid" };
  }

  if (rounded > 999_999_999) {
    return { ok: false, message: "Harga terlalu besar" };
  }

  return { ok: true, value: rounded };
}

export function toRupiahInteger(n: number): number {
  return Math.round(n);
}
