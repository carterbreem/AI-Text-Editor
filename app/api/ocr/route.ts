import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds; Hobby tier caps at 10s

/**
 * Server-side OCR using Tesseract. No paid APIs, runs entirely on CPU
 * inside the serverless function.
 *
 * The client calls Tesseract directly for speed, but this route exists
 * as a fallback and as the plug-in point for consistent server-side OCR.
 */
export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    const base64 = image.includes(",") ? image.split(",")[1] : image;
    const buffer = Buffer.from(base64, "base64");

    const worker = await createWorker("eng");
    const { data } = await worker.recognize(buffer);
    await worker.terminate();

    const rawLines = (data as any).lines ?? [];
    const blocks = rawLines
      .map((line: any) => {
        const words = line.words ?? [];
        if (!words.length) return null;
        const x0 = Math.min(...words.map((w: any) => w.bbox.x0));
        const y0 = Math.min(...words.map((w: any) => w.bbox.y0));
        const x1 = Math.max(...words.map((w: any) => w.bbox.x1));
        const y1 = Math.max(...words.map((w: any) => w.bbox.y1));
        return {
          text: String(line.text ?? "").trim(),
          confidence: line.confidence ?? 0,
          bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
        };
      })
      .filter((b: any) => b && b.text && b.confidence >= 30);

    return NextResponse.json({ blocks });
  } catch (err) {
    console.error("OCR failed:", err);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
