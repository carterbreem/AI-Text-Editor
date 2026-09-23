# AI Image Text Editor

Upload a screenshot, tap any text in it, and replace it with new text —
preserving the original font, size, color, and position.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Tesseract.js** for OCR (client-side, no API credits)
- **Qwen-Image-Edit** via NVIDIA NIM for AI replacement (server-side)
- **Canvas** fallback for offline / API-failure mode

## Flow

1. Home → Upload or Take Photo
2. Editor auto-detects text with Tesseract
3. Tap a highlighted region → enter new text → Replace
4. Server route `/api/replace` calls Qwen-Image-Edit with the full image
   and a preservation prompt
5. Preview, Undo, Reset, Download

## Local development

```bash
npm install
npm run dev
