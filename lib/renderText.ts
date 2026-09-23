import type { BBox, TextBlock } from "./types";

export function drawReplacement(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  newText: string,
  originalImage: HTMLImageElement
) {
  const { bbox } = block;
  const style = analyzeTextStyle(originalImage, bbox);

  ctx.save();
  ctx.fillStyle = style.color;
  ctx.textBaseline = "alphabetic";

  const family = FONT_STACK;

  let size = style.fontSize;
  ctx.font = `${style.weight} ${size}px ${family}`;
  let metrics = ctx.measureText(newText);

  while (metrics.width > bbox.w && size > 6) {
    size -= 1;
    ctx.font = `${style.weight} ${size}px ${family}`;
    metrics = ctx.measureText(newText);
  }

  const drawX = bbox.x;
  const drawY = bbox.y + bbox.h - Math.max(1, size * 0.15);

  ctx.fillText(newText, drawX, drawY);
  ctx.restore();
}

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type TextStyle = {
  color: string;
  fontSize: number;
  weight: number;
};

function analyzeTextStyle(img: HTMLImageElement, bbox: BBox): TextStyle {
  const c = document.createElement("canvas");
  c.width = bbox.w;
  c.height = bbox.h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
  const { data } = ctx.getImageData(0, 0, bbox.w, bbox.h);

  const pixels: { r: number; g: number; b: number; l: number }[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    pixels.push({ r, g, b, l });
  }

  // Sort by luminance ascending
  const sorted = [...pixels].sort((a, b) => a.l - b.l);

  // Find the true ink floor: the darkest pixel luminance.
  const minL = sorted[0].l;
  const maxL = sorted[sorted.length - 1].l;
  const range = maxL - minL;

  // Consider "ink" pixels to be those within 25% of the darkest value,
  // OR below 40% of the total luminance range. This isolates the actual
  // text color even in low-contrast images.
  const inkThreshold = Math.min(minL + range * 0.25, minL + 60);
  const inkPixels = pixels.filter((p) => p.l <= inkThreshold);

  // If our ink filter caught too many pixels (background is also dark),
  // fall back to the darkest 10%.
  const inkSet =
    inkPixels.length > pixels.length * 0.35
      ? sorted.slice(0, Math.max(1, Math.floor(pixels.length * 0.1)))
      : inkPixels;

  // Use the MODE of quantized ink colors — the actual dominant ink tone.
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (const p of inkSet) {
    const key = `${p.r >> 4},${p.g >> 4},${p.b >> 4}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count++;
      existing.r += p.r;
      existing.g += p.g;
      existing.b += p.b;
    } else {
      buckets.set(key, { count: 1, r: p.r, g: p.g, b: p.b });
    }
  }

  let bestKey = "";
  let bestCount = 0;
  buckets.forEach((v, k) => {
    if (v.count > bestCount) {
      bestCount = v.count;
      bestKey = k;
    }
  });

  const best = buckets.get(bestKey)!;
  const color = rgbToHex(best.r / best.count, best.g / best.count, best.b / best.count);

  // Font weight from ink density
  const inkRatio = inkSet.length / pixels.length;
  let weight = 400;
  if (inkRatio > 0.30) weight = 800;
  else if (inkRatio > 0.22) weight = 700;
  else if (inkRatio > 0.15) weight = 600;
  else if (inkRatio > 0.09) weight = 500;

  // Font size from cap-height: rows with ink
  const rowInk: number[] = new Array(bbox.h).fill(0);
  const darkCut = minL + range * 0.35;
  for (let y = 0; y < bbox.h; y++) {
    for (let x = 0; x < bbox.w; x++) {
      const i = (y * bbox.w + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (l <= darkCut) rowInk[y]++;
    }
  }
  let topRow = 0, bottomRow = bbox.h - 1;
  for (let y = 0; y < bbox.h; y++) {
    if (rowInk[y] > 1) { topRow = y; break; }
  }
  for (let y = bbox.h - 1; y >= 0; y--) {
    if (rowInk[y] > 1) { bottomRow = y; break; }
  }
  const inkHeight = Math.max(1, bottomRow - topRow + 1);
  const fontSize = Math.min(
    Math.round(inkHeight / 0.72),
    Math.round(bbox.h * 0.95)
  );

  return { color, fontSize, weight };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}
