import { downloadMediaItem } from './download-client.js';

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

export function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <button type="button" class="omni-fab" aria-expanded="false" aria-controls="${PANEL_ID}" title="OmniDownload media">
      <span class="omni-fab-icon" aria-hidden="true">↓</span>
      <span class="omni-fab-label">OmniDownload</span>
    </button>
    <div id="${PANEL_ID}" class="omni-panel" hidden>
      <header class="omni-panel-header">
        <strong>OmniDownload</strong>
        <span class="omni-version" aria-hidden="true"></span>
        <button type="button" class="omni-close" aria-label="Close">×</button>
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

  return root;
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
    status.textContent = opts.siteError || stale || 'No media found on this page.';
    return;
  }

  status.textContent = `${items.length} item${items.length === 1 ? '' : 's'} found${
    opts.siteError ? ` — ${opts.siteError}` : ''
  }`;

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'omni-item';

    const meta = document.createElement('div');
    meta.className = 'omni-item-meta';
    const title = document.createElement('span');
    title.className = 'omni-item-title';
    title.textContent = item.label;
    const sub = document.createElement('span');
    sub.className = 'omni-item-sub';
    sub.textContent = `${item.kind}${item.source ? ` · ${item.source}` : ''}`;
    meta.append(title, sub);

    const isExternalLanding = item.source === 'reddit-external';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'omni-download';
    btn.textContent = isExternalLanding ? 'Open' : 'Download';
    btn.addEventListener('click', async () => {
      if (isExternalLanding) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
        return;
      }
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const result = await downloadMediaItem(item, (f) => {
          btn.textContent = `${Math.round(f * 100)}%`;
        });
        if (!result?.ok) {
          throw new Error(result?.error || 'Download failed');
        }
        btn.textContent = 'Done';
      } catch (err) {
        btn.textContent = 'Retry';
        btn.disabled = false;
        status.textContent = err?.message || 'Download failed';
      }
    });

    li.append(meta, btn);
    list.appendChild(li);
  }
}
