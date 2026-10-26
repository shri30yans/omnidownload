import { MSG } from './messages.js';

/**
 * @param {'reddit'|'twitter'|'instagram'|'imgur'|'youtube'} platform
 * @param {string} url
 */
export async function extractViaPlatform(platform, url) {
  const res = await chrome.runtime.sendMessage({
    type: MSG.EXTRACT_PLATFORM,
    platform,
    url,
  });
  if (!res?.ok) {
    throw new Error(res?.error || 'Platform extract failed');
  }
  return res.items || [];
}
