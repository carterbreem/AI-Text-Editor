import { NextResponse } from "next/server";

/**
 * Inpainting runs client-side via CanvasInpaintProvider (no paid APIs,
 * no network). This route is reserved for a future self-hosted model
 * and intentionally has no paid provider wired in.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Server inpaint not enabled. Using client-side fill." },
    { status: 501 }
  );
}
