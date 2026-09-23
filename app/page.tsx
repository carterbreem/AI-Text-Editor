"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function Home() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    // Guard against absurdly large files that would stall OCR
    const MAX_MB = 12;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Image is too large. Keep it under ${MAX_MB}MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        sessionStorage.setItem("editor:image", reader.result as string);
        router.push("/editor");
      } catch {
        setError("Image too large for browser storage. Try a smaller one.");
      }
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          AI Image Text Editor
        </h1>
        <p className="text-neutral-500 mt-2 max-w-xs text-sm leading-relaxed">
          Upload an image, tap the text you want to change, and let AI
          replace it.
        </p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full py-4 rounded-2xl bg-black text-white font-medium active:scale-[0.98] transition"
        >
          Upload Image
        </button>
        <button
          onClick={() => cameraRef.current?.click()}
          className="w-full py-4 rounded-2xl bg-white border border-neutral-300 font-medium active:scale-[0.98] transition"
        >
          Take Photo
        </button>
      </div>

      {error && (
        <div className="max-w-xs text-center text-sm text-red-600">
          {error}
        </div>
      )}

      <p className="text-xs text-neutral-400 text-center max-w-xs mt-2">
        OCR runs on your device. Editing uses Qwen-Image-Edit via a secure
        server.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </main>
  );
}
