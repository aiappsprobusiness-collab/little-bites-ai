/**
 * Сжатие изображения до WebP, макс. 100KB.
 * Для upload рецептов (если используется).
 */

const MAX_BYTES = 100 * 1024;
const WEBP_QUALITY_INITIAL = 0.85;
const WEBP_QUALITY_MIN = 0.5;
const WEBP_QUALITY_STEP = 0.1;

function drawImageToCanvas(
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number
): HTMLCanvasElement {
  const { width: w, height: h } = img;
  let width = w;
  let height = h;
  if (width > maxWidth || height > maxHeight) {
    const r = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * r);
    height = Math.round(height * r);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d context unavailable');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl: string | null = null;
    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    if (typeof src === 'string') {
      img.src = src;
    } else {
      objectUrl = URL.createObjectURL(src);
      img.src = objectUrl;
    }
  });
}

/**
 * Сжимает файл изображения до WebP макс. 100KB.
 * @param file — исходный файл (image/*)
 * @returns Promise<Blob> — WebP Blob
 */
export async function compressImage(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const maxW = 1200;
  const maxH = 1200;
  const canvas = drawImageToCanvas(img, maxW, maxH);

  let quality = WEBP_QUALITY_INITIAL;
  let blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality);
  });

  while (blob.size > MAX_BYTES && quality > WEBP_QUALITY_MIN) {
    quality = Math.max(WEBP_QUALITY_MIN, quality - WEBP_QUALITY_STEP);
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', quality);
    });
  }

  return blob;
}
