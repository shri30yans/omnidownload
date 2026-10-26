const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * @param {string} shortcode
 */
export function shortcodeToMediaId(shortcode) {
  let sc = shortcode;
  if (sc.length > 28) sc = sc.slice(0, -28);
  let n = 0n;
  for (const ch of sc) {
    const idx = CHARSET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid shortcode character: ${ch}`);
    n = n * 64n + BigInt(idx);
  }
  return n.toString();
}

/**
 * @param {string} url
 */
export function shortcodeFromInstagramUrl(url) {
  const m = url.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/);
  return m?.[1] || null;
}
