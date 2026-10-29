import '../sites/load.js';
import { collectMedia, hasDedicatedExtractor } from '../core/registry.js';
import { dedupeMedia } from '../core/media-item.js';
import { MSG } from '../core/messages.js';
import { ROOT_ID, ensureRoot, renderMediaList, setPanelScanning, togglePanel } from './panel.js';

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

/** Reddit renders `<shreddit-post>` after navigation; rescan when the DOM updates. */
function rescanOnDomMutations(ctx) {
  if (!hasDedicatedExtractor(ctx)) return true;
  const host = ctx.location.hostname.toLowerCase();
  if (!host.endsWith('reddit.com') && host !== 'redd.it') return false;
  return /\/comments\//i.test(ctx.url);
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
    if (!items.length) {
      console.info('[OmniDownload] scan found no media', {
        url: ctx.url,
        siteError,
      });
    }
    renderMediaList(dedupeMedia(items), { siteError });
  } catch (err) {
    console.error('[OmniDownload] scan failed', err);
    renderMediaList([], { siteError: err?.message || 'Scan failed' });
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
function onPageUrlChange(lastUrlRef, debouncedScan) {
  if (location.href === lastUrlRef.current) return;
  lastUrlRef.current = location.href;
  setPanelScanning();
  debouncedScan();
}

function patchHistoryForSpa(lastUrlRef, debouncedScan) {
  const notify = () => onPageUrlChange(lastUrlRef, debouncedScan);
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function patchedHistoryState(...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  }
}

function observeDom() {
  const debounced = debounce(scan, SCAN_DEBOUNCE_MS);
  const lastUrlRef = { current: location.href };
  const onChange = (records) => {
    const root = document.getElementById(ROOT_ID);
    if (records?.length && root && records.every((r) => root.contains(r.target))) return;
    if (location.href !== lastUrlRef.current) {
      onPageUrlChange(lastUrlRef, debounced);
      return;
    }
    if (rescanOnDomMutations(buildContext())) {
      debounced();
    }
  };
  observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', () => onPageUrlChange(lastUrlRef, debounced));
  window.addEventListener('yt-navigate-finish', debounced);
  patchHistoryForSpa(lastUrlRef, debounced);
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
  ensureRoot();
  scan().catch((err) => console.error('[OmniDownload] rescan failed', err));
} else {
  globalThis.__OMNIDOWNLOAD_LOADED__ = true;
  const root = ensureRoot();
  root.addEventListener('omnidownload-refresh', () => {
    setPanelScanning();
    scan().catch((err) => console.error('[OmniDownload] refresh scan failed', err));
  });
  scan().catch((err) => {
    console.error('[OmniDownload] initial scan failed', err);
  });
  observeDom();
  if (rescanOnDomMutations(buildContext())) {
    setTimeout(() => scan().catch(() => {}), 2000);
  }
}
