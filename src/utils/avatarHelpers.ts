export const DEFAULT_AVATAR_URL = 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo';
export const MAX_AVATAR_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_AVATAR_STORED_LENGTH = 36000;
export const MAX_AVATAR_AUTH_URL_LENGTH = 500;

export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
]);

const ALLOWED_AVATAR_EXT_RE = /\.(jpe?g|png|webp|gif|avif)$/i;
const SAFE_DATA_IMAGE_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

export interface AvatarFileValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateAvatarImageFile(
  file: { type?: string; size?: number; name?: string } | null | undefined
): AvatarFileValidationResult {
  if (!file) {
    return { valid: false, reason: 'No se seleccionó ninguna imagen.' };
  }
  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, reason: 'El archivo de imagen está vacío.' };
  }
  if (size > MAX_AVATAR_UPLOAD_BYTES) {
    return { valid: false, reason: 'La imagen supera el límite de 12 MB.' };
  }
  const mime = String(file.type || '').trim().toLowerCase();
  const name = String(file.name || '').trim();
  const hasAllowedMime = Boolean(mime && (ALLOWED_AVATAR_MIME_TYPES.has(mime) || mime.startsWith('image/')));
  const hasAllowedExt = ALLOWED_AVATAR_EXT_RE.test(name);
  if (!hasAllowedMime && !hasAllowedExt) {
    return { valid: false, reason: 'Selecciona una foto válida (JPG, PNG, WebP o GIF).' };
  }
  return { valid: true };
}

export interface SquareCropRect {
  sx: number;
  sy: number;
  sSize: number;
  destSize: number;
}

export function computeSquareAvatarCropRect(
  width: number,
  height: number,
  targetSize = 160
): SquareCropRect {
  const w = Math.max(1, Math.floor(Number(width || 1)));
  const h = Math.max(1, Math.floor(Number(height || 1)));
  const sSize = Math.min(w, h);
  const sx = Math.floor((w - sSize) / 2);
  const sy = Math.floor((h - sSize) / 2);
  const destSize = Math.max(32, Math.min(256, Math.floor(Number(targetSize || 160))));
  return { sx, sy, sSize, destSize };
}

export function isDataImageAvatar(avatar: unknown): boolean {
  return typeof avatar === 'string' && avatar.trim().toLowerCase().startsWith('data:image/');
}

export function isValidStoredAvatar(
  avatar: unknown,
  maxLength = MAX_AVATAR_STORED_LENGTH
): boolean {
  if (typeof avatar !== 'string') return false;
  const trimmed = avatar.trim();
  if (!trimmed || trimmed.length > maxLength) return false;
  if (SAFE_DATA_IMAGE_RE.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeAvatarForCloud(
  avatar: unknown,
  fallback = DEFAULT_AVATAR_URL,
  maxLength = MAX_AVATAR_STORED_LENGTH
): string {
  if (typeof avatar !== 'string') return fallback;
  const trimmed = avatar.trim();
  if (!trimmed) return fallback;
  if (trimmed.length <= maxLength) {
    if (SAFE_DATA_IMAGE_RE.test(trimmed)) return trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return trimmed;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function sanitizeAvatarForAuthPhotoUrl(avatar: unknown): string | undefined {
  if (typeof avatar !== 'string') return undefined;
  const trimmed = avatar.trim();
  if (!trimmed || trimmed.length > MAX_AVATAR_AUTH_URL_LENGTH || isDataImageAvatar(trimmed)) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function loadImageElementFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    reader.onload = () => {
      const resultUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!resultUrl) {
        reject(new Error('No se pudo procesar la imagen seleccionada.'));
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Formato de imagen no compatible en este navegador.'));
      img.src = resultUrl;
    };
    reader.readAsDataURL(file);
  });
}

export async function compressAvatarImageInBrowser(file: File): Promise<string> {
  const validation = validateAvatarImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.reason || 'Imagen inválida.');
  }

  const img = await loadImageElementFromFile(file);
  const srcWidth = img.naturalWidth || img.width || 160;
  const srcHeight = img.naturalHeight || img.height || 160;

  const sizeSteps = [160, 128, 96];
  const qualitySteps = [0.84, 0.72, 0.58, 0.45];

  for (const dim of sizeSteps) {
    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Tu navegador no permite procesar imágenes.');
    }

    const rect = computeSquareAvatarCropRect(srcWidth, srcHeight, dim);
    ctx.fillStyle = '#0f1218';
    ctx.fillRect(0, 0, dim, dim);
    ctx.drawImage(img, rect.sx, rect.sy, rect.sSize, rect.sSize, 0, 0, dim, dim);

    for (const quality of qualitySteps) {
      const jpegUrl = canvas.toDataURL('image/jpeg', quality);
      if (jpegUrl.length <= MAX_AVATAR_STORED_LENGTH && SAFE_DATA_IMAGE_RE.test(jpegUrl)) {
        return jpegUrl;
      }
    }
  }

  throw new Error('La imagen comprimida sigue siendo demasiado pesada. Elige otra foto.');
}
