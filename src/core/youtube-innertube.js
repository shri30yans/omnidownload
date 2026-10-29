/**
 * Ask YouTube's own player API for streams, the way yt-dlp does: ask several
 * native "clients" and keep every format that has a plain `url`. The web
 * player's own formats are SABR/ciphered and cannot be fetched directly.
 *
 * Client list and versions come from yt-dlp's INNERTUBE_CLIENTS. Native
 * clients do not support cookies, so requests are sent without them (sending a
 * logged-in session's cookies to ios/android/visionos gets the request refused).
 * Which client is allowed depends on the video and on YouTube's bot checks, so
 * all are tried in parallel and their formats merged.
 */
const CLIENTS = {
  // Older iOS build: still returns every adaptive format with a plain URL.
  ios_legacy: {
    clientName: 'IOS',
    clientVersion: '20.10.4',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
    osName: 'iPhone',
    osVersion: '18.3.2.22D82',
  },
  ios: {
    clientName: 'IOS',
    clientVersion: '21.26.4',
    deviceMake: 'Apple',
    deviceModel: 'iPhone16,2',
    osName: 'iPhone',
    osVersion: '18.3.2.22D82',
  },
  // Combined 360p file (itag 18) and often more.
  android: {
    clientName: 'ANDROID',
    clientVersion: '21.26.364',
    androidSdkVersion: 30,
    osName: 'Android',
    osVersion: '11',
  },
  // Every format up to 4K without a PO token (not for made-for-kids videos).
  visionos: {
    clientName: 'VISIONOS',
    clientVersion: '1.02',
    deviceMake: 'Apple',
    deviceModel: 'RealityDevice17,1',
    osName: 'visionOS',
    osVersion: '26.5.23O471',
  },
  android_vr: {
    clientName: 'ANDROID_VR',
    clientVersion: '1.60.19',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    androidSdkVersion: 32,
    osName: 'Android',
    osVersion: '12L',
  },
  tv_samsung: {
    clientName: 'TVHTML5',
    clientVersion: '5.20260707',
    deviceMake: 'Samsung',
    deviceModel: 'UKS9800',
    osName: 'Tizen',
    osVersion: '2.4.0',
  },
};

/** The visitor id the page was served with; YouTube ties its bot checks to it. */
function pageVisitorData() {
  for (const script of document.scripts) {
    const m = script.textContent.match(/"VISITOR_DATA":"([^"]+)"/);
    if (m) return m[1];
  }
  return undefined;
}

async function fetchPlayer(client, videoId, visitorData) {
  const res = await fetch('/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { hl: 'en', ...client, ...(visitorData ? { visitorData } : {}) } },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) throw new Error(`YouTube player API HTTP ${res.status}`);
  return res.json();
}

/** Merge several player responses into one: the first playable one, with every format any client had. */
export function mergePlayerResponses(responses) {
  const playable = responses.filter((p) => p?.streamingData && p.playabilityStatus?.status === 'OK');
  const base = playable[0] ?? responses.find(Boolean);
  if (!base) throw new Error('YouTube player API returned nothing');
  const byItag = (key) => {
    const seen = new Map();
    for (const p of playable) {
      for (const f of p.streamingData[key] || []) {
        if (f.url && !seen.has(f.itag)) seen.set(f.itag, f);
      }
    }
    return [...seen.values()];
  };
  return {
    playabilityStatus: base.playabilityStatus,
    videoDetails: base.videoDetails,
    streamingData: playable.length
      ? { formats: byItag('formats'), adaptiveFormats: byItag('adaptiveFormats') }
      : base.streamingData,
  };
}

/** @param {string} videoId */
export async function fetchPlayerResponse(videoId) {
  const visitorData = pageVisitorData();
  const results = await Promise.allSettled(
    Object.values(CLIENTS).map((c) => fetchPlayer(c, videoId, visitorData)),
  );
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw results[0].reason;
  const merged = mergePlayerResponses(ok);
  const sd = merged.streamingData;
  if (!sd?.formats?.length && !sd?.adaptiveFormats?.length) {
    // Nothing downloadable: say why (e.g. YouTube's "confirm you're not a bot") instead of "no streams".
    const refused = ok.find((p) => p.playabilityStatus?.status && p.playabilityStatus.status !== 'OK');
    if (refused) throw new Error(refused.playabilityStatus.reason || refused.playabilityStatus.status);
  }
  return merged;
}
