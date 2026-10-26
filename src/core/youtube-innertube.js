/**
 * Ask YouTube's own player API for streams, the way yt-dlp does with its
 * "ios" client. That client returns plain `url`s (no signatureCipher), which
 * the web player's response does not. Called from the content script so the
 * request is same-origin and carries the visitor's real cookies/visitor data.
 */
const IOS_CLIENT = {
  clientName: 'IOS',
  clientVersion: '20.10.4',
  deviceMake: 'Apple',
  deviceModel: 'iPhone16,2',
  osName: 'iPhone',
  osVersion: '18.3.2.22D82',
  hl: 'en',
};

/** @param {string} videoId */
export async function fetchIosPlayerResponse(videoId) {
  const res = await fetch('/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: IOS_CLIENT },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) throw new Error(`YouTube player API HTTP ${res.status}`);
  return res.json();
}
