export async function prepareImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      2400 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return enhanceCanvas(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function enhanceCanvas(source: HTMLCanvasElement) {
  const context = source.getContext('2d');
  if (!context) return source;
  const pixels = context.getImageData(0, 0, source.width, source.height);
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray =
      0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    const value = contrasted > 205 ? 255 : contrasted < 65 ? 0 : contrasted;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return source;
}
