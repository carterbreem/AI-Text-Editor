import type { BBox, TextBlock } from "./types";

export interface OcrProvider {
  detect(imageDataUrl: string): Promise<TextBlock[]>;
}

/**
 * Tesseract OCR provider. Runs in the browser by default (fast, no
 * network, no API credits). Falls back to the server route /api/ocr
 * if the browser run fails.
 */
export class TesseractOcrProvider implements OcrProvider {
  constructor(private opts: { preferServer?: boolean } = {}) {}

  async detect(imageDataUrl: string): Promise<TextBlock[]> {
    if (this.opts.preferServer) {
      try {
        return await this.detectServer(imageDataUrl);
      } catch (e) {
        console.warn("Server OCR failed, falling back to client:", e);
      }
    }
    return this.detectClient(imageDataUrl);
  }

  private async detectServer(imageDataUrl: string): Promise<TextBlock[]> {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl }),
    });
    if (!res.ok) throw new Error("Server OCR failed");
    const data = await res.json();
    const img = await loadImage(imageDataUrl);

    return (data.blocks as any[]).map((b) => {
      const { color, bgColor } = sampleColors(img, b.bbox);
      return {
        id: crypto.randomUUID(),
        text: b.text,
        bbox: b.bbox,
        confidence: b.confidence,
        fontSize: Math.round(b.bbox.h * 0.85),
        color,
        bgColor,
        angle: 0,
      };
    });
  }

  private async detectClient(imageDataUrl: string): Promise<TextBlock[]> {
    const Tesseract = (await import("tesseract.js")).default;
    const { data } = await Tesseract.recognize(imageDataUrl, "eng");

    const img = await loadImage(imageDataUrl);
    const blocks: TextBlock[] = [];

    type Word = {
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    };

    const lines: Word[][] = [];
    const rawLines = (data as any).lines ?? [];
    if (rawLines.length) {
      for (const line of rawLines) {
        const words: Word[] = (line.words ?? []).map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox,
        }));
        if (words.length) lines.push(words);
      }
    } else {
      const words: Word[] = ((data as any).words ?? []).map((w: any) => ({
        text: w.text,
        confidence: w.confidence,
        bbox: w.bbox,
      }));
      for (const w of words) lines.push([w]);
    }

    for (const words of lines) {
      const text = words.map((w) => w.text).join(" ").trim();
      if (!text) continue;
      const conf = words.reduce((a, w) => a + w.confidence, 0) / words.length;
      if (conf < 30) continue;

      const x0 = Math.min(...words.map((w) => w.bbox.x0));
      const y0 = Math.min(...words.map((w) => w.bbox.y0));
      const x1 = Math.max(...words.map((w) => w.bbox.x1));
      const y1 = Math.max(...words.map((w) => w.bbox.y1));

      const bbox: BBox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const { color, bgColor } = sampleColors(img, bbox);

      blocks.push({
        id: crypto.randomUUID(),
        text,
        bbox,
        confidence: conf,
        fontSize: Math.round((y1 - y0) * 0.85),
        color,
        bgColor,
        angle: 0,
      });
    }

    return blocks;
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

function sampleColors(
  img: HTMLImageElement,
  bbox: BBox
): { color: string; bgColor: string } {
  const c = document.createElement("canvas");
  c.width = bbox.w;
  c.height = bbox.h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
  const { data } = ctx.getImageData(0, 0, bbox.w, bbox.h);

  const hist = new Map<string, number>();
  let darkest = { l: 1e9, c: "#000000" };
  let lightest = { l: -1, c: "#ffffff" };

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    hist.set(key, (hist.get(key) ?? 0) + 1);
    if (l < darkest.l) darkest = { l, c: rgbToHex(r, g, b) };
    if (l > lightest.l) lightest = { l, c: rgbToHex(r, g, b) };
  }

  let topKey = "", topCount = 0;
  for (const [k, v] of hist) if (v > topCount) { topCount = v; topKey = k; }
  const [tr, tg, tb] = topKey.split(",").map((n) => parseInt(n) * 16 + 8);
  const bgColor = rgbToHex(tr, tg, tb);

  return { color: darkest.c, bgColor };
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
