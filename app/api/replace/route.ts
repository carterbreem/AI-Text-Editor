import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Qwen-Image-Edit is currently disabled. The client uses the local
 * canvas pipeline instead. This route exists as a placeholder so the
 * fetch in the editor doesn't error out silently.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Qwen disabled — using local canvas" },
    { status: 501 }
  );
}
