import { sanitizeFilename } from '../core/filename.js';

/**
 * Fetch remote media bytes (used when the content script needs to convert them).
 * @param {string} url
 */
export async function fetchMediaBytes(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Could not fetch file (HTTP ${res.status})`);
  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error('Downloaded file is empty (URL may have expired — refresh the page)');
  }
  return buffer;
}

/**
 * Save an in-memory file (e.g. converted MP3) via chrome.downloads.
 * @param {ArrayBuffer} data
 * @param {string} filename
 * @param {string} [mimeType='application/octet-stream']
 */
export async function downloadMediaBytes(data, filename, mimeType = 'application/octet-stream') {
  const safeName = sanitizeFilename(filename);
  const blob = new Blob([data], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename: safeName,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    return await waitForDownload(downloadId);
  } finally {
    // Keep the object URL alive until the browser has started reading it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

/** Last resort: fetch the bytes here and hand the browser a blob URL. */
async function downloadViaFetch(url, filename) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Could not fetch file (HTTP ${res.status})`);
  const blob = await res.blob();
  if (!blob.size) {
    throw new Error('Downloaded file is empty (URL may have expired — refresh the page)');
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    return await waitForDownload(downloadId);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Resolve when the browser finishes (or fails) a download it started. */
function waitForDownload(downloadId, timeoutMs = 20 * 60_000) {
  return new Promise((resolve) => {
    const done = (result) => {
      chrome.downloads.onChanged.removeListener(onChanged);
      clearTimeout(timer);
      resolve(result);
    };
    const onChanged = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') done({ ok: true, downloadId });
      if (delta.state?.current === 'interrupted') {
        done({ ok: false, error: delta.error?.current || 'INTERRUPTED' });
      }
    };
    const timer = setTimeout(() => done({ ok: true, downloadId }), timeoutMs);
    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads.search({ id: downloadId }).then(([item]) => {
      if (item?.state === 'complete') done({ ok: true, downloadId });
      if (item?.state === 'interrupted') done({ ok: false, error: item.error });
    });
  });
}

/**
 * Let the browser stream the file to disk (no size limit, real progress).
 * Fall back to fetching the bytes ourselves only if the browser is refused.
 *
 * @param {string} url
 * @param {string} filename
 */
export async function downloadMediaUrl(url, filename) {
  const safeName = sanitizeFilename(filename);

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename: safeName,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    const result = await waitForDownload(downloadId);
    if (result.ok) return result;
    console.warn('[OmniDownload] browser download interrupted', result.error);
  } catch (err) {
    console.warn('[OmniDownload] chrome.downloads refused', err);
  }

  try {
    return await downloadViaFetch(url, safeName);
  } catch (err) {
    return { ok: false, error: err?.message || 'Download failed' };
  }
}
