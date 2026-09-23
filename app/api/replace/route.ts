import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server-side Replace using Qwen-Image-Edit via NVIDIA NIM.
 *
 * Sends the full image + a natural-language instruction to remove the
 * old text and render the new text, preserving font/size/color/position.
 *
 * NEVER expose NVIDIA_API_KEY to the client.
 */
export async function POST(req: NextRequest) {
  try {
    const { image, oldText, newText, bbox } = await req.json();

    if (!image || !newText) {
      return NextResponse.json(
        { error: "Missing image or newText" },
        { status: 400 }
      );
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    const baseUrl =
      process.env.QWEN_IMAGE_EDIT_ENDPOINT ??
      "https://integrate.api.nvidia.com/v1";

    if (!apiKey) {
      return NextResponse.json(
        { error: "NVIDIA_API_KEY not configured" },
        { status: 500 }
      );
    }

    const prompt = buildPrompt(oldText, newText, bbox);
    const base64 = image.includes(",") ? image.split(",")[1] : image;

    const res = await fetch(`${baseUrl}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: "qwen/qwen-image-edit",
        image: base64,
        prompt,
        n: 1,
        response_format: "b64_json",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Qwen-Image-Edit error:", res.status, errText);
      return NextResponse.json(
        { error: `Qwen edit failed (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const item = data?.data?.[0];

    if (!item) {
      return NextResponse.json(
        { error: "No image returned by Qwen" },
        { status: 502 }
      );
    }

    const resultDataUrl = item.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : item.url;

    return NextResponse.json({ image: resultDataUrl });
  } catch (err) {
    console.error("Replace route failed:", err);
    return NextResponse.json({ error: "Replace failed" }, { status: 500 });
  }
}

function buildPrompt(
  oldText: string,
  newText: string,
  bbox?: { x: number; y: number; w: number; h: number }
): string {
  const parts: string[] = [];

  if (oldText) {
    parts.push(`Replace the text "${oldText}" with "${newText}" in the image.`);
  } else {
    parts.push(`Change the text to "${newText}" in the image.`);
  }

  parts.push(
    "Preserve the original font style, size, color, position, and alignment of the text."
  );
  parts.push(
    "Keep the rest of the image completely unchanged. Reconstruct the background naturally where the old text was."
  );

  if (bbox) {
    parts.push(
      `The text is located around x=${bbox.x}, y=${bbox.y} in the image.`
    );
  }

  return parts.join(" ");
}
