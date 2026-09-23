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
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const family = FONT_STACK;

  let size = style.fontSize;
  ctx.font = `${style.weight} ${size}px ${family}`;
  let metrics = ctx.measureText(newText);

  const maxW = bbox.w;
  const maxH = bbox.h * 0.7;

  while (size > 6) {
    if (metrics.width <= maxW && size <= maxH) break;
    size -= 1;
    ctx.font = `${style.weight} ${size}px ${family}`;
    metrics = ctx.measureText(newText);
  }

  const cx = bbox.x + 1;
  const cy = bbox.y + bbox.h / 2;
  ctx.fillText(newText, cx, cy);
  ctx.restore();
}

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

type TextStyle = { color: string; fontSize: number; weight: number };

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

  const sorted = [...pixels].sort((a, b) => a.l - b.l);
  const minL = sorted[0].l;
  const maxL = sorted[sorted.length - 1].l;
  const range = maxL - minL;

  const inkThreshold = Math.min(minL + range * 0.25, minL + 60);
  const inkPixels = pixels.filter((p) => p.l <= inkThreshold);
  const inkSet =
    inkPixels.length > pixels.length * 0.35
      ? sorted.slice(0, Math.max(1, Math.floor(pixels.length * 0.1)))
      : inkPixels;

  const buckets = new Map<
    string,
    { count: number; r: number; g: number; b: number }
  >();
  for (const p of inkSet) {
    const key = `${p.r >> 4},${p.g >> 4},${p.b >> 4}`;
    const ex = buckets.get(key);
    if (ex) {
      ex.count++;
      ex.r += p.r;
      ex.g += p.g;
      ex.b += p.b;
    } else {
      buckets.set(key, { count: 1, r: p.r, g: p.g, b: p.b });
    }
  }
  let bestKey = "",
    bestCount = 0;
  buckets.forEach((v, k) => {
    if (v.count > bestCount) {
      bestCount = v.count;
      bestKey = k;
    }
  });
  const best = buckets.get(bestKey)!;
  const color = rgbToHex(
    best.r / best.count,
    best.g / best.count,
    best.b / best.count
  );

  const inkRatio = inkSet.length / pixels.length;
  let weight = 400;
  if (inkRatio > 0.30) weight = 800;
  else if (inkRatio > 0.22) weight = 700;
  else if (inkRatio > 0.15) weight = 600;
  else if (inkRatio > 0.09) weight = 500;

  const rowInk: number[] = new Array(bbox.h).fill(0);
  const darkCut = minL + range * 0.35;
  for (let y = 0; y < bbox.h; y++) {
    for (let x = 0; x < bbox.w; x++) {
      const i = (y * bbox.w + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (l <= darkCut) rowInk[y]++;
    }
  }
  let topRow = 0,
    bottomRow = bbox.h - 1;
  for (let y = 0; y < bbox.h; y++) {
    if (rowInk[y] > 1) {
      topRow = y;
      break;
    }
  }
  for (let y = bbox.h - 1; y >= 0; y--) {
    if (rowInk[y] > 1) {
      bottomRow = y;
      break;
    }
  }
  const inkHeight = Math.max(1, bottomRow - topRow + 1);

  const fromInk = Math.round(inkHeight / 0.72);
  const fromBox = Math.round(bbox.h * 0.6);
  const fontSize = Math.min(fromInk, fromBox);

  return { color, fontSize, weight };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}
