import { MSG } from '../core/messages.js';

const TIMEOUT_MS = 12_000;

function requestInject() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: MSG.INJECT_YT_PLAYER }, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!res?.ok) {
        reject(new Error(res?.error || 'Inject failed'));
        return;
      }
      resolve();
    });
  });
}

/**
 * Read YouTube player JSON via extension inject file (MAIN world).
 */
export function readYoutubePlayerResponse(videoId) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const finish = (err, player) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(player);
    };

    const onMessage = (event) => {
      if (event.source !== window || event.data?.channel !== 'OMNIDOWNLOAD_YT_PLAYER') {
        return;
      }
      const player = event.data.player;
      if (videoId && player?.videoDetails?.videoId !== videoId) return;
      if (player?.streamingData) {
        finish(null, player);
      }
    };

    window.addEventListener('message', onMessage);

    const timer = setTimeout(() => {
      finish(new Error('Could not read the YouTube player (try reloading the tab)'));
    }, TIMEOUT_MS);

    requestInject().catch((err) => finish(err));
  });
}
