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

  const maxW = bbox.w;
  const maxH = bbox.h * 0.5;

  // Shrink to fit width; also clamp by max height
  while (size > 6) {
    ctx.font = `${style.weight} ${size}px ${family}`;
    const m = ctx.measureText(newText);
    const glyphH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (m.width <= maxW && (glyphH === 0 || glyphH <= maxH || size <= maxH)) break;
    size -= 1;
  }

  ctx.font = `${style.weight} ${size}px ${family}`;
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

  // Only use the darkest ~8% for ink color — the antialiased middle
  // tones throw off the average.
  const inkCut = minL + Math.max(30, range * 0.15);
  const inkSet = pixels.filter((p) => p.l <= inkCut);

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

  let bestKey = "";
  let bestCount = 0;
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

  // Weight: use the ratio of dark ink pixels to total.
  const inkRatio = inkSet.length / pixels.length;
  let weight = 500;
  if (inkRatio > 0.30) weight = 700;
  else if (inkRatio > 0.20) weight = 600;
  else if (inkRatio > 0.10) weight = 500;
  else weight = 400;

  // Cap height from row occupancy
  const rowInk: number[] = new Array(bbox.h).fill(0);
  const darkCut = minL + range * 0.3;
  for (let y = 0; y < bbox.h; y++) {
    for (let x = 0; x < bbox.w; x++) {
      const i = (y * bbox.w + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (l <= darkCut) rowInk[y]++;
    }
  }

  let topRow = 0;
  let bottomRow = bbox.h - 1;
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
  const fromBox = Math.round(bbox.h * 0.5);
  const fontSize = Math.min(fromInk, fromBox);

  return { color, fontSize, weight };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}
