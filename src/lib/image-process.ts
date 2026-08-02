/** Client-side image helpers (ganti sharp di Next). */

const LOGO_SIZE = 512;
const LOGO_RADIUS = Math.round(LOGO_SIZE * 0.18);
const PHOTO_MAX_SIDE = 800;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal membaca gambar"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Gagal mengompres gambar"));
        else resolve(blob);
      },
      type,
      quality
    );
  });
}

/** Logo toko: 512×512 contain + sudut melengkung → WebP ~90%. */
export async function processStoreLogo(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = LOGO_SIZE;
  canvas.height = LOGO_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LOGO_SIZE, LOGO_SIZE);

  const scale = Math.min(LOGO_SIZE / img.width, LOGO_SIZE / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const x = Math.round((LOGO_SIZE - w) / 2);
  const y = Math.round((LOGO_SIZE - h) / 2);
  ctx.drawImage(img, x, y, w, h);

  // Mask sudut melengkung
  const masked = document.createElement("canvas");
  masked.width = LOGO_SIZE;
  masked.height = LOGO_SIZE;
  const mctx = masked.getContext("2d");
  if (!mctx) throw new Error("Canvas tidak tersedia");
  mctx.beginPath();
  mctx.roundRect(0, 0, LOGO_SIZE, LOGO_SIZE, LOGO_RADIUS);
  mctx.clip();
  mctx.drawImage(canvas, 0, 0);

  try {
    return await canvasToBlob(masked, "image/webp", 0.9);
  } catch {
    return await canvasToBlob(masked, "image/png");
  }
}

/** Ikon PWA sederhana dari logo (PNG). */
export async function generatePwaIcon(
  logoBlob: Blob,
  size: number
): Promise<Blob> {
  const img = await loadImage(logoBlob);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return canvasToBlob(canvas, "image/png");
}

/**
 * Foto barang: max sisi 800, WebP ~78%.
 * Pre-compress besar dulu ke JPEG jika >1.2MB (pola Next client).
 */
export async function processProductPhoto(file: File): Promise<File> {
  let source: Blob = file;
  if (file.size > 1_200_000) {
    const img = await loadImage(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, w, h);
      source = await canvasToBlob(canvas, "image/jpeg", 0.82);
    }
  }

  const img = await loadImage(source);
  const scale = Math.min(
    1,
    PHOTO_MAX_SIDE / Math.max(img.width, img.height)
  );
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.drawImage(img, 0, 0, w, h);

  let blob: Blob;
  try {
    blob = await canvasToBlob(canvas, "image/webp", 0.78);
  } catch {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
  }

  const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
  return new File([blob], file.name.replace(/\.\w+$/, "") + ext, {
    type: blob.type,
    lastModified: Date.now(),
  });
}
