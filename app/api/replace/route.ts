import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server-side Replace using Qwen-Image-Edit via NVIDIA NIM.
 *
 * The client sends a CROP of the image around the text to be edited.
 * Qwen edits only that crop; the client pastes it back. This guarantees
 * pixels outside the crop are byte-for-byte identical to the original.
 *
 * NEVER expose NVIDIA_API_KEY to the client.
 */
export async function POST(req: NextRequest) {
  try {
    const { image, oldText, newText } = await req.json();

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

    const prompt = buildPrompt(oldText, newText);
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

function buildPrompt(oldText: string, newText: string): string {
  // This crop contains ONLY the target text (plus surrounding padding).
  // Be very explicit about what to preserve.
  const lines: string[] = [];

  if (oldText && oldText.trim()) {
    lines.push(
      `Edit this cropped image: replace the text "${oldText}" with "${newText}".`
    );
  } else {
    lines.push(`Edit this cropped image: change the text to "${newText}".`);
  }

  lines.push(
    "CRITICAL RULES:",
    "- Match the EXACT same font family, weight, size, and letter spacing as the original text.",
    "- Match the EXACT same ink color of the original text.",
    "- Match the EXACT same baseline position and alignment.",
    "- Seamlessly remove all traces of the original text — no ghosting, no double text, no shadows.",
    "- The background must be reconstructed cleanly so it looks untouched.",
    "- Do not add any new elements, borders, watermarks, or text anywhere else.",
    "- Do not change the background color or texture outside the text area."
  );

  return lines.join(" ");
}
