import { extractImgur } from './platforms/imgur.js';
import { extractTwitter } from './platforms/twitter.js';

/**
 * @param {string} platform
 * @param {string} url
 */
export async function extractOnPlatform(platform, url) {
  switch (platform) {
    case 'twitter':
      return extractTwitter(url);
    case 'imgur':
      return extractImgur(url);
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
