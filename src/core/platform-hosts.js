/** Background platform extractors keyed by hostname suffix (no site-specific names in call sites). */
const HOST_PLATFORM = [
  { suffix: 'imgur.com', platform: 'imgur' },
  { suffix: 'i.imgur.com', platform: 'imgur' },
  { suffix: 'twitter.com', platform: 'twitter' },
  { suffix: 'x.com', platform: 'twitter' },
];

/**
 * @param {string} url
 * @returns {'imgur' | 'twitter' | null}
 */
export function platformForUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const { suffix, platform } of HOST_PLATFORM) {
      if (host === suffix || host.endsWith(`.${suffix}`)) return platform;
    }
  } catch {
    /* invalid url */
  }
  return null;
}
