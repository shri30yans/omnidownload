import { downloadMediaItem } from './download-client.js';
import {
  defaultExtension,
  filenameFromUrl,
  sanitizeFilename,
} from '../core/filename.js';
import { withExtension } from '../core/media-item.js';

export const ROOT_ID = 'omnidownload-root';
const PANEL_ID = 'omnidownload-panel';

export function togglePanel() {
  const root = ensureRoot();
  const panel = root.querySelector(`#${PANEL_ID}`);
  const fab = root.querySelector('.omni-fab');
  if (!panel || !fab) return;
  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  fab.setAttribute('aria-expanded', String(willOpen));
  return willOpen;
}

function suggestedFilename(item) {
  return (
    item.filename ||
    filenameFromUrl(item.url, `omnidownload-${item.kind}`) ||
    sanitizeFilename(`omnidownload${defaultExtension(item.kind)}`)
  );
}

/**
 * Build the picker options for one list row. Same asset → one row; resolutions
 * and formats (including MP3 convert for audio) appear as variants.
 *
 * @param {import('../core/media-item.js').MediaItem} item
 * @returns {import('../core/media-item.js').MediaVariant[]}
 */
function variantsForItem(item) {
  const base =
    item.variants?.length > 0
      ? item.variants.map((v) => ({
          url: v.url,
          label: v.label,
          filename: v.filename || item.filename,
          hls: v.hls ?? item.hls,
          convert: v.convert,
          audioUrl: v.audioUrl,
          totalBytes: v.totalBytes,
        }))
      : [
          {
            url: item.url,
            label: nativeFormatLabel(item),
            filename: item.filename,
            hls: item.hls,
          },
        ];

  if (item.kind !== 'audio') return base;
  if (base.some((v) => v.convert === 'mp3')) return base;

  const src = base.find((v) => !v.convert) || base[0];
  return [
    ...base,
    {
      url: src.url,
      label: 'MP3',
      filename: withExtension(src.filename || suggestedFilename(item), '.mp3'),
      convert: 'mp3',
    },
  ];
}

/** @param {import('../core/media-item.js').MediaItem} item */
function nativeFormatLabel(item) {
  const name = item.filename || item.url;
  if (item.hls) return 'MP4';
  if (/\.m4a(\?|$)/i.test(name)) return 'M4A';
  if (/\.weba(\?|$)/i.test(name) || /webm/i.test(name)) return 'WebM';
  if (/\.mp3(\?|$)/i.test(name)) return 'MP3';
  if (/\.mp4(\?|$)/i.test(name)) return 'MP4';
  if (item.kind === 'audio') return 'Original';
  if (item.kind === 'video') return 'Best';
  return 'Original';
}

export function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <button type="button" class="omni-fab" aria-expanded="false" aria-controls="${PANEL_ID}" aria-label="OmniDownload" title="OmniDownload">
      <svg class="omni-fab-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle class="omni-fab-ring" cx="24" cy="24" r="22" />
        <path class="omni-fab-glyph" d="M24 14v13M19 26l5 5 5-5M16 32h16" />
      </svg>
    </button>
    <div id="${PANEL_ID}" class="omni-panel" hidden>
      <header class="omni-panel-header">
        <div class="omni-panel-brand">
          <span class="omni-panel-mark" aria-hidden="true">↓</span>
          <div class="omni-panel-titles">
            <strong>OmniDownload</strong>
            <span class="omni-version" aria-hidden="true"></span>
          </div>
        </div>
        <div class="omni-panel-actions">
          <button type="button" class="omni-refresh" aria-label="Refresh media list" title="Refresh">↻</button>
          <button type="button" class="omni-close" aria-label="Close">×</button>
        </div>
      </header>
      <div class="omni-panel-body">
        <p class="omni-status">Scanning…</p>
        <ul class="omni-list"></ul>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const versionEl = root.querySelector('.omni-version');
  if (versionEl && typeof __OMNIDOWNLOAD_VERSION__ !== 'undefined') {
    versionEl.textContent = `v${__OMNIDOWNLOAD_VERSION__}`;
  }

  const fab = root.querySelector('.omni-fab');
  const panel = root.querySelector(`#${PANEL_ID}`);
  const close = root.querySelector('.omni-close');

  fab.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
  });
  close.addEventListener('click', () => {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  });

  root.querySelector('.omni-refresh')?.addEventListener('click', () => {
    root.dispatchEvent(new CustomEvent('omnidownload-refresh', { bubbles: false }));
  });

  return root;
}

export function setPanelScanning() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const status = root.querySelector('.omni-status');
  const list = root.querySelector('.omni-list');
  if (status) status.textContent = 'Scanning…';
  if (list) list.innerHTML = '';
}

/**
 * Prefer the same bytes as download when the URL is a displayable image.
 * @param {import('../core/media-item.js').MediaItem} item
 * @returns {string | null}
 */
function thumbSrcForItem(item) {
  if (item.previewUrl) return item.previewUrl;
  if (item.kind === 'image') return item.url;
  if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(item.url)) return item.url;
  return null;
}

/**
 * @param {import('../core/media-item.js').MediaItem} item
 * @returns {HTMLElement}
 */
function buildItemThumb(item) {
  const wrap = document.createElement('div');
  wrap.className = 'omni-item-thumb';
  wrap.setAttribute('aria-hidden', 'true');

  const src = thumbSrcForItem(item);
  if (src) {
    const img = document.createElement('img');
    img.className = 'omni-thumb-img';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = src;
    img.addEventListener('error', () => {
      wrap.classList.add('omni-item-thumb--fallback');
      wrap.textContent = item.kind === 'video' ? '▶' : '◻';
    });
    wrap.appendChild(img);
    return wrap;
  }

  if (item.kind === 'video' && !item.hls) {
    const video = document.createElement('video');
    video.className = 'omni-thumb-video';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.referrerPolicy = 'no-referrer';
    video.src = item.url;
    video.addEventListener('error', () => {
      wrap.classList.add('omni-item-thumb--fallback');
      wrap.textContent = '▶';
    });
    video.addEventListener('loadeddata', () => {
      try {
        video.currentTime = Math.min(0.25, video.duration || 0.25);
      } catch {
        /* seek may fail */
      }
    });
    wrap.appendChild(video);
    return wrap;
  }

  wrap.classList.add('omni-item-thumb--fallback');
  wrap.textContent =
    item.kind === 'video' || item.hls ? '▶' : item.kind === 'audio' ? '♪' : '◻';
  return wrap;
}

/**
 * @param {import('../core/media-item.js').MediaItem} item
 * @param {import('../core/media-item.js').MediaVariant} variant
 */
function downloadTarget(item, variant) {
  return {
    ...item,
    url: variant.url,
    filename: variant.filename || item.filename,
    hls: variant.hls ?? item.hls,
    convert: variant.convert,
    audioUrl: variant.audioUrl,
    totalBytes: variant.totalBytes,
  };
}

/**
 * @param {import('../core/media-item.js').MediaItem[]} items
 * @param {{ siteError?: string | null }} [opts]
 */
export function renderMediaList(items, opts = {}) {
  const root = ensureRoot();
  const status = root.querySelector('.omni-status');
  const list = root.querySelector('.omni-list');
  list.innerHTML = '';

  if (!items.length) {
    const stale =
      typeof __OMNIDOWNLOAD_VERSION__ === 'undefined'
        ? 'Reload this tab (old OmniDownload script still running).'
        : null;
    const onRedditPost =
      /reddit\.com/i.test(location.href) && /\/comments\//i.test(location.href);
    const redditHint = onRedditPost
      ? 'Reddit post not ready, blocked, or captcha — wait for the page to load, then tap ↻ Refresh.'
      : null;
    status.textContent = opts.siteError || stale || redditHint || 'No media found on this page.';
    return;
  }

  status.textContent = `${items.length} item${items.length === 1 ? '' : 's'} found${
    opts.siteError ? ` — ${opts.siteError}` : ''
  }`;

  for (const item of items) {
    const variants = variantsForItem(item);
    let selected = 0;

    const li = document.createElement('li');
    li.className = 'omni-item';
    li.dataset.kind = item.kind;

    const meta = document.createElement('div');
    meta.className = 'omni-item-meta';
    const title = document.createElement('span');
    title.className = 'omni-item-title';
    title.textContent = item.label;

    const sub = document.createElement('span');
    sub.className = 'omni-item-sub';

    /** @type {HTMLSelectElement | null} */
    let select = null;
    if (variants.length > 1) {
      select = document.createElement('select');
      select.className = 'omni-quality';
      select.setAttribute('aria-label', 'Quality or format');
      for (const [i, v] of variants.entries()) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = v.label;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        selected = Number(select.value) || 0;
        sub.textContent = variants[selected].filename || suggestedFilename(item);
      });
      meta.append(title, select, sub);
    } else {
      meta.append(title, sub);
    }
    sub.textContent = variants[0].filename || suggestedFilename(item);

    const cta = document.createElement('div');
    cta.className = 'omni-item-cta';

    cta.appendChild(buildItemThumb(item));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'omni-download';
    btn.textContent = 'Download';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      if (select) select.disabled = true;
      btn.textContent = '…';
      try {
        const target = downloadTarget(item, variants[selected]);
        const result = await downloadMediaItem(target, (f) => {
          btn.textContent = `${Math.round(f * 100)}%`;
        });
        if (!result?.ok) {
          throw new Error(result?.error || 'Download failed');
        }
        btn.textContent = 'Done ✓';
        setTimeout(() => {
          btn.disabled = false;
          if (select) select.disabled = false;
          btn.textContent = 'Download';
        }, 3000);
      } catch (err) {
        btn.textContent = 'Retry';
        btn.disabled = false;
        if (select) select.disabled = false;
        status.textContent = err?.message || 'Download failed';
      }
    });
    cta.appendChild(btn);

    li.append(meta, cta);
    list.appendChild(li);
  }
}
