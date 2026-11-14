/**
 * Shrinks a photo in the browser before upload so multi-photo forms
 * (e.g. delivery signup with 8 documents) stay well under server body limits.
 * Falls back to the original file if the browser can't decode/encode it (e.g. HEIC).
 */
export async function compressImage(
  file,
  { maxDimension = 1600, quality = 0.8, skipBelowBytes = 300 * 1024 } = {},
) {
  try {
    if (!(file instanceof File) || !file.type.startsWith("image/")) return file
    if (file.size <= skipBelowBytes) return file

    const bitmap = await loadBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, maxDimension / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.fillStyle = "#ffffff" // flatten transparency (PNG) before JPEG
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    if (typeof bitmap.close === "function") bitmap.close()

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    )
    if (!blob || blob.size >= file.size) return file

    const baseName = (file.name || "photo").replace(/\.[^.]+$/, "")
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    })
  } catch {
    return file
  }
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation keeps phone photos upright
      return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}
