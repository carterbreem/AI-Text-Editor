import type { BBox } from "./types";

export interface InpaintProvider {
  remove(imageDataUrl: string, boxes: BBox[]): Promise<string>;
}

/**
 * Fast canvas-based inpainting. For each bbox, samples the border pixels
 * around the box and fills the interior via bilinear interpolation, then
 * applies a light median filter to kill residual ink specks.
 *
 * Good enough for screenshots with flat or gently-gradient backgrounds.
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
      const pad = Math.max(2, Math.round(Math.min(b.w, b.h) * 0.08));
      const x0 = Math.max(0, b.x - pad);
      const y0 = Math.max(0, b.y - pad);
      const x1 = Math.min(canvas.width, b.x + b.w + pad);
      const y1 = Math.min(canvas.height, b.y + b.h + pad);

      const w = x1 - x0;
      const h = y1 - y0;
      if (w <= 2 || h <= 2) continue;

      const region = ctx.getImageData(x0, y0, w, h);
      const rd = region.data;

      // --- Step 1: sample border pixels ---
      // Top and bottom rows, left and right columns
      const samplePixel = (px: number, py: number): [number, number, number] => {
        const i = (py * w + px) * 4;
        return [rd[i], rd[i + 1], rd[i + 2]];
      };

      // Averages along each edge (with a small inset to avoid antialiasing)
      const inset = 1;
      const topAvg = avgLine(w, inset, inset, "h", rd);
      const bottomAvg = avgLine(w, h - 1 - inset, inset, "h", rd);
      const leftAvg = avgLine(h, inset, inset, "v", rd, w);
      const rightAvg = avgLine(h, w - 1 - inset, inset, "v", rd, w);

      // --- Step 2: bilinear fill of interior ---
      const px0 = inset + 1;
      const py0 = inset + 1;
      const px1 = w - inset - 2;
      const py1 = h - inset - 2;

      for (let y = py0; y <= py1; y++) {
        for (let x = px0; x <= px1; x++) {
          const tx = (x - px0) / Math.max(1, px1 - px0);
          const ty = (y - py0) / Math.max(1, py1 - py0);

          // Interpolate top vs bottom, left vs right
          const tbR = topAvg[0] * (1 - ty) + bottomAvg[0] * ty;
          const tbG = topAvg[1] * (1 - ty) + bottomAvg[1] * ty;
          const tbB = topAvg[2] * (1 - ty) + bottomAvg[2] * ty;

          const lrR = leftAvg[0] * (1 - tx) + rightAvg[0] * tx;
          const lrG = leftAvg[1] * (1 - tx) + rightAvg[1] * tx;
          const lrB = leftAvg[2] * (1 - tx) + rightAvg[2] * tx;

          // Blend the two: use the one closer to the edge
          const wTB = Math.min(1, 2 * Math.min(ty, 1 - ty));
          const wLR = Math.min(1, 2 * Math.min(tx, 1 - tx));
          const sum = wTB + wLR || 1;

          const r = (tbR * wTB + lrR * wLR) / sum;
          const g = (tbG * wTB + lrG * wLR) / sum;
          const b = (tbB * wTB + lrB * wLR) / sum;

          const i = (y * w + x) * 4;
          rd[i] = r;
          rd[i + 1] = g;
          rd[i + 2] = b;
          rd[i + 3] = 255;
        }
      }

      // Also fill the thin border strip right around the hole
      for (let y = inset; y < h - inset; y++) {
        for (let x = inset; x < w - inset; x++) {
          if (x >= px0 && x <= px1 && y >= py0 && y <= py1) continue;
          const tx = (x - px0) / Math.max(1, px1 - px0);
          const ty = (y - py0) / Math.max(1, py1 - py0);
          const tbR = topAvg[0] * (1 - ty) + bottomAvg[0] * ty;
          const tbG = topAvg[1] * (1 - ty) + bottomAvg[1] * ty;
          const tbB = topAvg[2] * (1 - ty) + bottomAvg[2] * ty;
          const lrR = leftAvg[0] * (1 - tx) + rightAvg[0] * tx;
          const lrG = leftAvg[1] * (1 - tx) + rightAvg[1] * tx;
          const lrB = leftAvg[2] * (1 - tx) + rightAvg[2] * tx;
          const wTB = Math.min(1, 2 * Math.min(ty, 1 - ty));
          const wLR = Math.min(1, 2 * Math.min(tx, 1 - tx));
          const sum = wTB + wLR || 1;
          const i = (y * w + x) * 4;
          rd[i] = (tbR * wTB + lrR * wLR) / sum;
          rd[i + 1] = (tbG * wTB + lrG * wLR) / sum;
          rd[i + 2] = (tbB * wTB + lrB * wLR) / sum;
        }
      }

      // --- Step 3: median filter to remove residual ink specks ---
      medianFilter(rd, w, h, 2);

      ctx.putImageData(region, x0, y0);
    }

    return canvas.toDataURL("image/png");
  }
}

function avgLine(
  length: number,
  fixed: number,
  from: number,
  dir: "h" | "v",
  data: Uint8ClampedArray,
  stride = 0
): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = from; i < length; i++) {
    const idx =
      dir === "h" ? (fixed * length + i) * 4 : (i * stride + fixed) * 4;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
    n++;
  }
  return [r / n, g / n, b / n];
}

function medianFilter(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
) {
  const copy = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const i = (ny * w + nx) * 4;
          rs.push(copy[i]);
          gs.push(copy[i + 1]);
          bs.push(copy[i + 2]);
        }
      }
      rs.sort((a, b) => a - b);
      gs.sort((a, b) => a - b);
      bs.sort((a, b) => a - b);
      const mid = Math.floor(rs.length / 2);
      const i = (y * w + x) * 4;
      data[i] = rs[mid];
      data[i + 1] = gs[mid];
      data[i + 2] = bs[mid];
    }
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
