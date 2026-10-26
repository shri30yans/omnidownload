// Control characters are illegal in filenames on every platform, so match them on purpose.
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * @param {string} name
 * @param {number} [maxLen=180]
 */
export function sanitizeFilename(name, maxLen = 180) {
  let base = name.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim();
  if (!base) base = 'download';
  if (base.length > maxLen) {
    const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
    const stem = base.slice(0, maxLen - ext.length);
    base = stem + ext;
  }
  return base;
}

/**
 * @param {string} url
 * @param {string} [fallback='download']
 */
export function filenameFromUrl(url, fallback = 'download') {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last && last.includes('.')) {
      return sanitizeFilename(decodeURIComponent(last));
    }
    const ext = guessExtensionFromPath(u.pathname);
    return sanitizeFilename(`${fallback}${ext}`);
  } catch {
    return sanitizeFilename(fallback);
  }
}

function guessExtensionFromPath(pathname) {
  if (/\.(jpe?g|png|gif|webp|avif)$/i.test(pathname)) return '';
  if (/\.(mp4|webm|mov)$/i.test(pathname)) return '';
  return '.bin';
}

/**
 * @param {import('./media-item.js').MediaKind} kind
 */
export function defaultExtension(kind) {
  switch (kind) {
    case 'image':
      return '.jpg';
    case 'video':
      return '.mp4';
    case 'audio':
      return '.m4a';
    default:
      return '';
  }
}
