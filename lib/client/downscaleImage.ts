/**
 * Client-side image downscaling — runs in the browser before a captured photo
 * leaves the device. Phone cameras produce 3–12 MB JPEGs/HEICs; re-encoding to a
 * bounded JPEG keeps uploads fast on cellular and well under the Server Action
 * body cap (`next.config.mjs`). Re-encoding also bakes in EXIF orientation and
 * drops the rest of the EXIF (location etc.) — fine for v1, which records EXIF as
 * `null` anyway.
 *
 * Defensive by design: any unsupported path or failure returns the ORIGINAL file,
 * so a resize hiccup never costs a child their capture. The result is never larger
 * than the input.
 */
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function downscaleImage(file: File, maxDimension = MAX_DIMENSION): Promise<File> {
  // Browser-only and image-only; otherwise pass the bytes through untouched.
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;
  if (!file.type.startsWith('image/')) return file;

  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF orientation so the re-encoded pixels are upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    // Never grow the upload (e.g. a small PNG that re-encodes larger).
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
