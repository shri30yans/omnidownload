import { MSG } from '../core/messages.js';
import { downloadMediaUrl } from './download-media.js';
import { extractOnPlatform } from './extract-router.js';
import { injectYoutubePlayerReader } from './page-main-world.js';

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  if (isRestrictedUrl(tab.url)) return;

  const toggled = await tryTogglePanel(tab.id);
  if (toggled) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['dist/content.bundle.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['styles/content.css'],
    });
    await chrome.tabs.sendMessage(tab.id, { type: MSG.TOGGLE_PANEL });
  } catch (err) {
    console.error('[OmniDownload] toolbar action failed', err);
  }
});

function isRestrictedUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('https://chrome.google.com/webstore')
  );
}

async function tryTogglePanel(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.TOGGLE_PANEL });
    return true;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ ok: false, error: err?.message || String(err) });
  });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case MSG.DOWNLOAD:
      return downloadMediaUrl(message.url, message.filename);
    case MSG.FETCH_HEAD:
      return fetchHead(message.url);
    case MSG.EXTRACT_PLATFORM:
      return extractPlatform(message.platform, message.url);
    case MSG.INJECT_YT_PLAYER: {
      const tabId = sender?.tab?.id;
      if (!tabId) return { ok: false, error: 'No tab' };
      try {
        await injectYoutubePlayerReader(tabId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    }
    default:
      return { ok: false, error: 'Unknown message' };
  }
}

async function fetchHead(url) {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  const type = res.headers.get('content-type') || '';
  return { ok: res.ok, contentType: type, status: res.status };
}

async function extractPlatform(platform, url) {
  try {
    const items = await extractOnPlatform(platform, url);
    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), items: [] };
  }
}
