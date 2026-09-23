import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server-side ERASE using Qwen-Image-Edit via NVIDIA NIM.
 *
 * Qwen is used ONLY to remove the old text and reconstruct the
 * background. It must NOT add any new text — the client draws the
 * replacement text deterministically with canvas afterward, so any
 * stray text Qwen adds will be covered by our own render.
 */
export async function POST(req: NextRequest) {
  try {
    const { image, oldText } = await req.json();

    if (!image || !oldText) {
      return NextResponse.json(
        { error: "Missing image or oldText" },
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

    const prompt = [
      "Erase and remove the text from this image completely.",
      `The text to remove is: "${oldText}".`,
      "Fill the erased region with the surrounding background so the area looks clean and empty.",
      "Do not write, draw, or render any new text.",
      "Preserve everything else in the image exactly as it is.",
    ].join(" ");

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
    console.error("Erase route failed:", err);
    return NextResponse.json({ error: "Erase failed" }, { status: 500 });
  }
}
