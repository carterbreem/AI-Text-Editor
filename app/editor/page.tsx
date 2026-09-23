const handleReplace = async () => {
    if (!selected || !working || !replacement.trim()) return;
    setBusy("replace");

    const target = selected;
    const newText = replacement.trim();

    try {
      const img = await loadImage(working);

      // ---- Step 1: crop around the target text with padding ----
      const padX = Math.max(24, Math.round(target.bbox.w * 0.4));
      const padY = Math.max(24, Math.round(target.bbox.h * 1.2));

      const rawX0 = target.bbox.x - padX;
      const rawY0 = target.bbox.y - padY;
      const rawX1 = target.bbox.x + target.bbox.w + padX;
      const rawY1 = target.bbox.y + target.bbox.h + padY;

      let cropX = Math.max(0, Math.floor(rawX0));
      let cropY = Math.max(0, Math.floor(rawY0));
      let cropW = Math.min(img.width - cropX, Math.ceil(rawX1 - cropX));
      let cropH = Math.min(img.height - cropY, Math.ceil(rawY1 - cropY));

      // Grow to at least 512px on shorter side so Qwen has context
      const MIN_SIDE = 512;
      if (cropW < MIN_SIDE) {
        const grow = Math.ceil((MIN_SIDE - cropW) / 2);
        const newX = Math.max(0, cropX - grow);
        cropW = Math.min(img.width - newX, cropW + (cropX - newX) * 2);
        cropX = newX;
      }
      if (cropH < MIN_SIDE) {
        const grow = Math.ceil((MIN_SIDE - cropH) / 2);
        const newY = Math.max(0, cropY - grow);
        cropH = Math.min(img.height - newY, cropH + (cropY - newY) * 2);
        cropY = newY;
      }

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      cropCanvas
        .getContext("2d")!
        .drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const cropDataUrl = cropCanvas.toDataURL("image/png");

      // ---- Step 2: ask Qwen to ERASE the old text (not draw new) ----
      const res = await fetch("/api/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: cropDataUrl,
          oldText: target.text,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erase failed (${res.status})`);
      }

      const data = await res.json();
      const cleanedCropImg = await loadImage(data.image);

      // ---- Step 3: paste cleaned crop back onto the full image ----
      const outCanvas = document.createElement("canvas");
      outCanvas.width = img.width;
      outCanvas.height = img.height;
      const outCtx = outCanvas.getContext("2d")!;
      outCtx.drawImage(img, 0, 0);

      const feather = Math.min(12, Math.floor(Math.min(cropW, cropH) * 0.04));
      const masked = featherPaste(cleanedCropImg, cropW, cropH, feather);
      outCtx.drawImage(masked, cropX, cropY);

      // ---- Step 4: draw the new text on top with matched styling ----
      drawReplacement(outCtx, target, newText, img);

      const result = outCanvas.toDataURL("image/png");

      setHistory((h) => [...h, working]);
      setWorking(result);
      showToast("Replaced.");
    } catch (e: any) {
      console.warn("Qwen erase failed, falling back to canvas:", e);
      try {
        const img = await loadImage(working);
        const inpaint = new CanvasInpaintProvider();
        const cleaned = await inpaint.remove(working, [target.bbox]);
        const cleanedImg = await loadImage(cleaned);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(cleanedImg, 0, 0);
        drawReplacement(ctx, target, newText, img);
        setHistory((h) => [...h, working]);
        setWorking(canvas.toDataURL("image/png"));
        showToast("Replaced (local fallback).");
      } catch (e2) {
        console.error(e2);
        showToast("Replace failed.");
      }
    } finally {
      setBlocks((bs) => bs.filter((b) => b.id !== target.id));
      setSelected(null);
      setReplacement("");
      setBusy(null);
    }
  };
