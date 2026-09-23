"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TesseractOcrProvider } from "@/lib/ocr";
import { CanvasInpaintProvider } from "@/lib/inpaint";
import { drawReplacement } from "@/lib/renderText";
import type { TextBlock } from "@/lib/types";

export default function EditorPage() {
  const router = useRouter();

  const [original, setOriginal] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [selected, setSelected] = useState<TextBlock | null>(null);
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState<"ocr" | "replace" | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [displayScale, setDisplayScale] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const src = sessionStorage.getItem("editor:image");
    if (!src) {
      router.replace("/");
      return;
    }
    setOriginal(src);
    setWorking(src);
    runOcr(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => computeScale();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSize]);

  useEffect(() => {
    computeScale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSize]);

  const computeScale = () => {
    if (!containerRef.current || !imgSize.w) return;
    const cw = containerRef.current.clientWidth - 24;
    setDisplayScale(Math.min(1, cw / imgSize.w));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const runOcr = async (src: string) => {
    setBusy("ocr");
    try {
      const img = await loadImage(src);
      setImgSize({ w: img.width, h: img.height });
      const ocr = new TesseractOcrProvider();
      const found = await ocr.detect(src);
      setBlocks(found);
      if (!found.length) showToast("No text detected in this image.");
    } catch (e) {
      console.error(e);
      showToast("Could not detect text.");
    } finally {
      setBusy(null);
    }
  };

  const handleReplace = async () => {
    if (!selected || !working || !replacement.trim()) return;
    setBusy("replace");

    const target = selected;
    const newText = replacement.trim();

    try {
      const img = await loadImage(working);

      // Canvas inpaint — erase the old text
      const inpaint = new CanvasInpaintProvider();
      const cleaned = await inpaint.remove(working, [target.bbox]);
      const cleanedImg = await loadImage(cleaned);

      // Draw the new text with matched styling
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(cleanedImg, 0, 0);
      drawReplacement(ctx, target, newText, img);

      const result = canvas.toDataURL("image/png");

      setHistory((h) => [...h, working]);
      setWorking(result);
      showToast("Replaced.");
    } catch (e) {
      console.error(e);
      showToast("Replace failed.");
    } finally {
      setBlocks((bs) => bs.filter((b) => b.id !== target.id));
      setSelected(null);
      setReplacement("");
      setBusy(null);
    }
  };

  const handleUndo = () => {
    if (!history.length || !working) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setWorking(prev);
    runOcr(prev);
  };

  const handleReset = () => {
    if (!original) return;
    setWorking(original);
    setHistory([]);
    setSelected(null);
    setReplacement("");
    runOcr(original);
  };

  const handleDownload = () => {
    if (!working) return;
    const a = document.createElement("a");
    a.href = working;
    a.download = `edited-${Date.now()}.png`;
    a.click();
  };

  if (!original || !working) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-neutral-500">Loading…</div>
      </main>
    );
  }

  const displaySrc = showOriginal ? original : working;

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <button
          onClick={() => router.push("/")}
          className="text-sm text-neutral-500"
        >
          ← Back
        </button>
        <div className="text-sm font-medium">
          {busy === "ocr"
            ? "Detecting text…"
            : busy === "replace"
            ? "Replacing…"
            : "Editor"}
        </div>
        <button
          onMouseDown={() => setShowOriginal(true)}
          onMouseUp={() => setShowOriginal(false)}
          onMouseLeave={() => setShowOriginal(false)}
          onTouchStart={() => setShowOriginal(true)}
          onTouchEnd={() => setShowOriginal(false)}
          className="text-sm text-neutral-500 select-none"
        >
          Hold: Original
        </button>
      </div>

      <div
        ref={containerRef}
        className="flex-1 flex items-start justify-center p-3 overflow-auto"
      >
        <div
          className="relative"
          style={{
            width: imgSize.w * displayScale,
            height: imgSize.h * displayScale,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displaySrc}
            alt="edit"
            className="absolute inset-0 w-full h-full select-none"
            draggable={false}
          />

          {!showOriginal &&
            blocks.map((b) => {
              const isSel = selected?.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelected(b);
                    setReplacement(cleanOcrText(b.text));
                  }}
                  className={`absolute border-2 rounded-sm transition ${
                    isSel
                      ? "border-blue-500 bg-blue-500/25"
                      : "border-blue-400/40 bg-blue-400/5"
                  }`}
                  style={{
                    left: b.bbox.x * displayScale,
                    top: b.bbox.y * displayScale,
                    width: b.bbox.w * displayScale,
                    height: b.bbox.h * displayScale,
                  }}
                  aria-label={b.text}
                />
              );
            })}

          {(busy === "ocr" || busy === "replace") && (
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
              <div className="px-4 py-2 rounded-full bg-black/80 text-white text-xs">
                {busy === "ocr" ? "Scanning for text…" : "Replacing…"}
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed left-1/2 -translate-x-1/2 bottom-32 z-50">
          <div className="px-4 py-2 rounded-full bg-black/85 text-white text-xs">
            {toast}
          </div>
        </div>
      )}

      <div className="bg-white border-t border-neutral-200 p-3 space-y-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {selected ? (
          <div className="space-y-2">
            <div className="text-xs text-neutral-500 truncate">
              Original:{" "}
              <span className="text-neutral-800">{selected.text}</span>
            </div>
            <div className="flex gap-2">
              <input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="New text"
                className="flex-1 px-3 py-3 rounded-xl border border-neutral-300 text-base outline-none focus:border-blue-500"
                autoFocus
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleReplace();
                }}
              />
              <button
                onClick={handleReplace}
                disabled={busy === "replace" || !replacement.trim()}
                className="px-5 py-3 rounded-xl bg-black text-white font-medium disabled:opacity-40"
              >
                Replace
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-500 text-center py-2">
            {busy === "ocr"
              ? "Scanning for text…"
              : blocks.length
              ? "Tap a highlighted text region to edit it."
              : busy
              ? ""
              : "No text regions available."}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={!history.length}
            className="flex-1 py-3 rounded-xl bg-neutral-100 font-medium disabled:opacity-40"
          >
            Undo
          </button>
          <button
            onClick={handleReset}
            className="flex-1 py-3 rounded-xl bg-neutral-100 font-medium"
          >
            Reset
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium"
          >
            Download
          </button>
        </div>
      </div>
    </main>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

/**
 * Clean Tesseract output: strip trailing junk single-chars, weird
 * punctuation at the edges, and collapse whitespace.
 */
function cleanOcrText(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  // Remove leading/trailing single letters that aren't part of a word
  // e.g. "yahoo xXx" -> "yahoo", "Nigeria J" -> "Nigeria"
  // Only applies at the very end, and only if the last token is short
  // and doesn't look like a normal word continuation.
  t = t.replace(/\s+[A-Za-z]{1,2}[^\w]*$/, "");
  // Strip trailing punctuation that isn't sentence-ending
  t = t.replace(/[,;:\-|]+$/, "");
  return t.trim();
}
