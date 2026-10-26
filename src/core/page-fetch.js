/**
 * Same-origin fetch from the content script. Unlike the service worker this
 * carries the visitor's own cookies (no forbidden `Cookie` header needed), so
 * logged-in sessions work and requests look like the site's own traffic.
 *
 * @param {string} path - origin-relative URL
 * @param {RequestInit} [init]
 */
export async function pageFetchJson(path, init = {}) {
  const res = await fetch(path, { credentials: 'include', ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('login required or blocked (got HTML instead of JSON)');
  }
}
