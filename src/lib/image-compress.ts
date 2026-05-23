/**
 * Compress an image (File or Blob) using a canvas.
 * - Resizes so the longest side is at most `maxWidth` px (keeps proportions).
 * - Always re-encodes to JPEG (works for HEIC/PNG inputs that decode in the browser).
 * - Targets ~1.5MB by stepping down quality if needed.
 * - If the source is already <= 1.5MB AND already a jpeg, returns the original.
 */
export async function compressImage(
  file: File | Blob,
  maxWidth = 1920,
  initialQuality = 0.85,
  maxBytes = 1.5 * 1024 * 1024,
): Promise<File> {
  const originalSize = file.size;
  const originalType = (file as File).type || "image/jpeg";

  if (originalSize <= maxBytes && originalType === "image/jpeg") {
    console.log(
      `[compressImage] skip: ${(originalSize / 1024).toFixed(0)}KB already <= ${(maxBytes / 1024).toFixed(0)}KB`,
    );
    return file as File;
  }

  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Impossibile decodificare l'immagine"));
    i.src = dataUrl;
  });

  const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // White background in case of transparency (PNG)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.filter = "contrast(1.08) brightness(1.03)";
  ctx.drawImage(img, 0, 0, w, h);
  ctx.filter = "none";

  let quality = initialQuality;
  let blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  // Step quality down only moderately: receipt text becomes unreadable if we go too low.
  const minReadableQuality = 0.72;
  while (blob && blob.size > maxBytes && quality > minReadableQuality) {
    quality = Math.max(minReadableQuality, quality - 0.06);
    blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
  }
  if (!blob) throw new Error("Compressione fallita");

  console.log(
    `[compressImage] ${(originalSize / 1024).toFixed(0)}KB -> ${(blob.size / 1024).toFixed(0)}KB (q=${quality.toFixed(2)}, ${w}x${h})`,
  );

  return new File([blob], "receipt.jpg", { type: "image/jpeg" });
}

export async function fileToBase64(file: File | Blob): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return dataUrl.split(",")[1] ?? "";
}

/**
 * Crop an image element using the pixel crop from react-image-crop and
 * return a JPEG File (uncompressed at full crop resolution — pass it to
 * compressImage afterwards).
 */
export async function cropImageToFile(
  imageEl: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
): Promise<File> {
  const scaleX = imageEl.naturalWidth / imageEl.width;
  const scaleY = imageEl.naturalHeight / imageEl.height;
  const sx = crop.x * scaleX;
  const sy = crop.y * scaleY;
  const sw = crop.width * scaleX;
  const sh = crop.height * scaleY;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas non disponibile");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imageEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Ritaglio fallito"))),
      "image/jpeg",
      0.95,
    ),
  );
  return new File([blob], "receipt-cropped.jpg", { type: "image/jpeg" });
}