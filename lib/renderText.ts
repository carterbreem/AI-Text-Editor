import type { BBox, TextBlock } from "./types";

/**
 * Draw newText into a canvas at the block's bbox, matching the original
 * text's approximate font size, weight, color, and baseline.
 *
 * The renderer samples the ORIGINAL text pixels to determine:
 *  - ink color (median of dark pixels inside bbox)
 *  - font weight (from stroke thickness / ink density)
 *  - horizontal alignment (from ink distribution)
 *
 * This runs after Qwen has erased the old text and healed the background,
 * so we're drawing onto a clean surface.
 */
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

  // Fit: start at estimated size, shrink to fit width, then center
  let size = style.fontSize;
  ctx.font = `${style.weight} ${size}px ${family}`;
  let metrics = ctx.measureText(newText);

  while (metrics.width > bbox.w && size > 6) {
    size -= 1;
    ctx.font = `${style.weight} ${size}px ${family}`;
    metrics = ctx.measureText(newText);
  }

  // If the new text is much narrower than the box, we could stretch it,
  // but for MVP we just left-align to match typical UI text.
  const drawX = bbox.x;
  // Baseline: bbox bottom minus a small descender allowance
  const drawY = bbox.y + bbox.h - Math.max(1, size * 0.15);

  ctx.fillText(newText, drawX, drawY);
  ctx.restore();
}

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type TextStyle = {
  color: string;
  fontSize: number;
  weight: number; // 400 | 500 | 600 | 700 | 800
};

function analyzeTextStyle(
  img: HTMLImageElement,
  bbox: BBox
): TextStyle {
  const c = document.createElement("canvas");
  c.width = bbox.w;
  c.height = bbox.h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
  const { data } = ctx.getImageData(0, 0, bbox.w, bbox.h);

  // ---- 1. Find ink pixels and estimate ink color ----
  // Compute luminance for every pixel, then take the darkest 15% as "ink".
  const pixels: { r: number; g: number; b: number; l: number }[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    pixels.push({ r, g, b, l });
  }
  pixels.sort((a, b) => a.l - b.l);

  const inkCount = Math.max(1, Math.floor(pixels.length * 0.15));
  const inkPixels = pixels.slice(0, inkCount);

  // Median ink color (robust to outliers)
  const rs = inkPixels.map((p) => p.r).sort((a, b) => a - b);
  const gs = inkPixels.map((p) => p.g).sort((a, b) => a - b);
  const bs = inkPixels.map((p) => p.b).sort((a, b) => a - b);
  const mid = Math.floor(inkPixels.length / 2);
  const color = rgbToHex(rs[mid], gs[mid], bs[mid]);

  // ---- 2. Estimate font weight from ink density ----
  // Higher ratio of ink pixels = bolder font.
  // Typical ranges: light ~5%, regular ~10%, medium ~15%, bold ~22%, black ~30%
  const totalPixels = pixels.length;
  const darkThreshold =
    (inkPixels[Math.floor(inkPixels.length * 0.5)]?.l ?? 0) + 60;
  const trulyDark = pixels.filter((p) => p.l < darkThreshold).length;
  const inkRatio = trulyDark / totalPixels;

  let weight = 400;
  if (inkRatio > 0.28) weight = 800;
  else if (inkRatio > 0.20) weight = 700;
  else if (inkRatio > 0.14) weight = 600;
  else if (inkRatio > 0.09) weight = 500;
  else weight = 400;

  // ---- 3. Estimate font size from cap height ----
  // Find the top and bottom rows that contain ink.
  let topRow = 0, bottomRow = bbox.h - 1;
  const rowInk: number[] = new Array(bbox.h).fill(0);
  for (let y = 0; y < bbox.h; y++) {
    for (let x = 0; x < bbox.w; x++) {
      const i = (y * bbox.w + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (l < darkThreshold) rowInk[y]++;
    }
  }
  for (let y = 0; y < bbox.h; y++) {
    if (rowInk[y] > 1) { topRow = y; break; }
  }
  for (let y = bbox.h - 1; y >= 0; y--) {
    if (rowInk[y] > 1) { bottomRow = y; break; }
  }
  const inkHeight = Math.max(1, bottomRow - topRow + 1);

  // For most sans-serif fonts, cap height ≈ 0.72 × font size.
  // We also respect the bbox height as an upper bound.
  const fontSize = Math.min(
    Math.round(inkHeight / 0.72),
    Math.round(bbox.h * 0.95)
  );

  return { color, fontSize, weight };
}

function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
  );
}
