import '../sites/load.js';
import { collectMedia, hasDedicatedExtractor } from '../core/registry.js';
import { dedupeMedia } from '../core/media-item.js';
import { MSG } from '../core/messages.js';
import { ROOT_ID, ensureRoot, renderMediaList, togglePanel } from './panel.js';

const SCAN_DEBOUNCE_MS = 800;
let scanInFlight = false;
let rescanQueued = false;
/** @type {MutationObserver | undefined} */
let observer;

function buildContext() {
  return {
    document,
    url: location.href,
    location,
  };
}

/**
 * After the extension is reloaded or updated, the old content script keeps
 * running in already-open tabs but loses its link to the extension. Stop
 * quietly instead of throwing "Extension context invalidated" on every scan.
 */
function extensionAlive() {
  return Boolean(globalThis.chrome?.runtime?.id);
}

async function scan() {
  if (!extensionAlive()) {
    observer?.disconnect();
    return;
  }
  if (scanInFlight) {
    // The page changed mid-scan; run once more when this one finishes.
    rescanQueued = true;
    return;
  }
  scanInFlight = true;
  try {
    const ctx = buildContext();
    const { items, siteError } = await collectMedia(ctx);
    renderMediaList(dedupeMedia(items), { siteError });
  } finally {
    scanInFlight = false;
    if (rescanQueued) {
      rescanQueued = false;
      scan().catch((err) => console.error('[OmniDownload] rescan failed', err));
    }
  }
}

function debounce(fn, ms) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

/**
 * Rescan when the page changes. Dedicated extractors call remote APIs, so they
 * are keyed on the URL (SPA navigation) instead of every DOM mutation.
 */
function observeDom() {
  const debounced = debounce(scan, SCAN_DEBOUNCE_MS);
  let lastUrl = location.href;
  const onChange = (records) => {
    // Our own panel updates must not trigger another scan.
    const root = document.getElementById(ROOT_ID);
    if (records?.length && root && records.every((r) => root.contains(r.target))) return;
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      debounced();
    } else if (!hasDedicatedExtractor(buildContext())) {
      debounced();
    }
  };
  observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', onChange);
  window.addEventListener('yt-navigate-finish', debounced);
}

function onToolbarToggle() {
  const opened = togglePanel();
  if (opened) {
    scan().catch((err) => {
      console.error('[OmniDownload] scan failed', err);
    });
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.TOGGLE_PANEL) onToolbarToggle();
});

if (globalThis.__OMNIDOWNLOAD_LOADED__) {
  // Injected again on a tab that already had the content script.
} else {
  globalThis.__OMNIDOWNLOAD_LOADED__ = true;
  ensureRoot();
  scan().catch((err) => {
    console.error('[OmniDownload] initial scan failed', err);
  });
  observeDom();
}
