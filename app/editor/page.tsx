const handleReplace = async () => {
    if (!selected || !working || !replacement.trim()) return;
    setBusy("replace");

    const target = selected;
    const newText = replacement.trim();

    try {
      const img = await loadImage(working);

      // 1. Erase the old text with the canvas inpaint
      const inpaint = new CanvasInpaintProvider();
      const cleaned = await inpaint.remove(working, [target.bbox]);
      const cleanedImg = await loadImage(cleaned);

      // 2. Draw the new text on top with matched styling
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
