import type { TextBlock } from "./types";

/**
 * Draw newText into a canvas at the block's bbox, matching approximate
 * font size, color, and alignment. Auto-shrinks to fit.
 *
 * Used as part of the canvas fallback when /api/replace is unavailable.
 */
export function drawReplacement(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  newText: string
) {
  const { bbox, color, fontSize } = block;

  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  const family =
    'Inter, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  let size = fontSize;
  ctx.font = `600 ${size}px ${family}`;
  let metrics = ctx.measureText(newText);
  while (metrics.width > bbox.w && size > 6) {
    size -= 1;
    ctx.font = `600 ${size}px ${family}`;
    metrics = ctx.measureText(newText);
  }

  const cx = bbox.x;
  const cy = bbox.y + bbox.h / 2;
  ctx.fillText(newText, cx, cy);

  ctx.restore();
}
