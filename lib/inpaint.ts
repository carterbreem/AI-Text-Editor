import type { BBox } from "./types";

export interface InpaintProvider {
  /**
   * Remove text inside each bbox from the image, reconstructing the
   * background naturally. Returns a new data URL.
   */
  remove(imageDataUrl: string, boxes: BBox[]): Promise<string>;
}

/**
 * MVP inpainting: for each box, sample surrounding pixels and fill via
 * a simple inward-push (telea-lite) diffusion. Good enough for flat /
 * textured backgrounds. Used as fallback when /api/replace is
 * unavailable (network, rate limit, etc.).
 */
export class CanvasInpaintProvider implements InpaintProvider {
  async remove(imageDataUrl: string, boxes: BBox[]): Promise<string> {
    const img = await loadImage(imageDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    for (const b of boxes) {
      const pad = Math.max(2, Math.round(Math.min(b.w, b.h) * 0.15));
      const x0 = Math.max(0, b.x - pad);
      const y0 = Math.max(0, b.y - pad);
      const x1 = Math.min(canvas.width, b.x + b.w + pad);
      const y1 = Math.min(canvas.height, b.y + b.h + pad);

      const w = x1 - x0;
      const h = y1 - y0;
      const region = ctx.getImageData(x0, y0, w, h);
      const rd = region.data;

      const mask = new Uint8Array(w * h).fill(1);

      for (let iter = 0; iter < Math.max(w, h); iter++) {
        const next = new Uint8Array(mask);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (!mask[idx]) continue;
            let r = 0, g = 0, b = 0, n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const nidx = ny * w + nx;
                if (mask[nidx]) continue;
                const p = nidx * 4;
                r += rd[p]; g += rd[p + 1]; b += rd[p + 2];
                n++;
              }
            }
            if (n > 0) {
              const p = idx * 4;
              rd[p] = r / n;
              rd[p + 1] = g / n;
              rd[p + 2] = b / n;
              next[idx] = 0;
            }
          }
        }
        mask.set(next);
        if (mask.every((v) => v === 0)) break;
      }

      ctx.putImageData(region, x0, y0);
    }

    smoothRegions(ctx, boxes);

    return canvas.toDataURL("image/png");
  }
}

function smoothRegions(ctx: CanvasRenderingContext2D, boxes: BBox[]) {
  for (const b of boxes) {
    const pad = Math.max(2, Math.round(Math.min(b.w, b.h) * 0.15));
    const x = Math.max(0, b.x - pad);
    const y = Math.max(0, b.y - pad);
    const w = Math.min(ctx.canvas.width - x, b.w + pad * 2);
    const h = Math.min(ctx.canvas.height - y, b.h + pad * 2);
    ctx.filter = "blur(1px)";
    const region = ctx.getImageData(x, y, w, h);
    ctx.putImageData(region, x, y);
    ctx.filter = "none";
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
