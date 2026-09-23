import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server-side ERASE using Qwen-Image-Edit via NVIDIA NIM.
 *
 * IMPORTANT: Qwen is used ONLY to remove the old text and reconstruct
 * the background. It does NOT render new text — diffusion models cannot
 * reproduce a specific typeface reliably. The client draws the new text
 * deterministically with canvas so typography is exact.
 *
 * NEVER expose NVIDIA_API_KEY to the client.
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
      `Remove the text "${oldText}" from this image.`,
      "Reconstruct the background so the text leaves no trace — no ghosting, no shadows, no outlines.",
      "Do NOT add any new text or symbols anywhere in the image.",
      "Preserve the background color, gradient, texture, and any graphical elements exactly as they are around the removed text.",
      "Keep the rest of the image pixel-identical.",
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
