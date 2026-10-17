export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i;

/** Validate image uploads consistently before sending files to the media API. */
export function validateImageUpload(file: File): string | null {
  const hasAllowedType = file.type
    ? ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())
    : ALLOWED_IMAGE_EXTENSIONS.test(file.name);

  if (!hasAllowedType) {
    return 'Выберите изображение в формате JPG, PNG или WebP.';
  }
  if (file.size <= 0) {
    return 'Выбранный файл пустой. Выберите другое изображение.';
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return 'Размер изображения не должен превышать 10 МБ.';
  }
  return null;
}
