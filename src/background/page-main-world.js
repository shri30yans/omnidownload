/**
 * @param {number} tabId
 */
export async function injectYoutubePlayerReader(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    world: 'MAIN',
    files: ['inject/youtube-player.js'],
  });
}
