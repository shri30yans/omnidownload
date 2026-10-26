/**
 * Parse Reddit post listing JSON from `…/comments/…/.json`.
 */

function unescapeHtml(url) {
  return url.replace(/&amp;/g, '&');
}

function postPayload(json) {
  return json?.[0]?.data?.children?.[0]?.data;
}

function mediaPost(post) {
  if (!post) return null;
  if (post.crosspost_parent_list?.length) {
    return post.crosspost_parent_list[post.crosspost_parent_list.length - 1];
  }
  return post;
}

/**
 * Off-site URL for link posts (not i.redd.it / v.redd.it).
 * @param {unknown} json
 */
export function redditExternalUrl(json) {
  const post = mediaPost(postPayload(json));
  if (!post) return null;
  const videoUrl = post.url_overridden_by_dest || post.url;
  if (!videoUrl || typeof videoUrl !== 'string') return null;
  if (/reddit\.com/i.test(videoUrl) && /\/comments\//.test(videoUrl)) return null;
  if (/i\.redd\.it|v\.redd\.it|preview\.redd\.it/i.test(videoUrl)) return null;
  return unescapeHtml(videoUrl);
}

/**
 * @param {unknown} json
 * @returns {{ url: string; label: string; kind: 'image'|'video'|'audio'|'other' }[]}
 */
export function mediaFromRedditJson(json) {
  const out = [];
  const post = mediaPost(postPayload(json));
  if (!post) return out;

  function push(url, label, kind) {
    if (!url || typeof url !== 'string') return;
    let u = unescapeHtml(url);
    if (/\.gifv$/i.test(u)) u = u.replace(/\.gifv$/i, '.mp4');
    out.push({ url: u, label, kind });
  }

  const rv =
    post.secure_media?.reddit_video ||
    post.media?.reddit_video ||
    post.secure_media?.media?.reddit_video;

  if (rv?.fallback_url) {
    push(rv.fallback_url, 'Reddit video (MP4)', 'video');
  }

  const direct = post.url_overridden_by_dest || post.url;
  if (direct && /i\.redd\.it|preview\.redd\.it/i.test(direct)) {
    push(direct, 'Reddit image', 'image');
  }

  const meta = post.media_metadata;
  if (meta && typeof meta === 'object') {
    let n = 0;
    for (const entry of Object.values(meta)) {
      n += 1;
      if (entry?.e === 'RedditVideo') {
        if (entry.hlsUrl) push(entry.hlsUrl, `Gallery video ${n} (HLS)`, 'video');
        if (entry.dashUrl) push(entry.dashUrl, `Gallery video ${n} (DASH)`, 'video');
        continue;
      }
      const src = entry?.s?.u || entry?.s?.gif || entry?.p?.[entry.p.length - 1]?.u;
      if (src) {
        const kind = entry?.e === 'AnimatedImage' ? 'video' : 'image';
        push(src, `Gallery ${n}`, kind);
      }
    }
  }

  return out;
}
