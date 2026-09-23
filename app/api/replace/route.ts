import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server-side ERASE using Qwen-Image-Edit via NVIDIA NIM.
 *
 * Qwen is used ONLY to remove the old text and reconstruct the
 * background. The client draws the replacement text with canvas
 * afterward, so any stray text Qwen adds will be covered.
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

    const prompt = `Erase and remove the text "${oldText}" from this image. Fill the erased region with the surrounding background. Do not write, draw, or render any new text. Preserve everything else exactly.`;

    const base64 = image.includes(",") ? image.split(",")[1] : image;

    const res = await fetch(`${baseUrl}/genai/qwen/qwen-image-edit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        prompt,
        image: base64,
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
    const b64 = data?.artifacts?.[0]?.base64;

    if (!b64) {
      console.error("Unexpected Qwen response shape:", JSON.stringify(data).slice(0, 500));
      return NextResponse.json(
        { error: "No image returned by Qwen" },
        { status: 502 }
      );
    }

    return NextResponse.json({ image: `data:image/png;base64,${b64}` });
  } catch (err) {
    console.error("Replace route failed:", err);
    return NextResponse.json({ error: "Replace failed" }, { status: 500 });
  }
}
