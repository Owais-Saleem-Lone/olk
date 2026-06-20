const MAX_SIZE_BYTES = 500 * 1024
const MAX_DIMENSION = 1200

export async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_SIZE_BYTES && !file.type.includes('png')) {
    return file
  }

  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = 0.82
  let blob = await canvas.convertToBlob({ type: 'image/webp', quality })

  while (blob.size > MAX_SIZE_BYTES && quality > 0.3) {
    quality -= 0.1
    blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  }

  const ext = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${ext}.webp`, { type: 'image/webp' })
}

export function validateImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
    setTimeout(() => resolve(false), 8000)
  })
}
