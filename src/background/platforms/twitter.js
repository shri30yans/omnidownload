import { mediaItem } from '../../core/media-item.js';

const BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const GRAPHQL_ENDPOINT = '2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId';

function tweetIdFromUrl(url) {
  const m = url.match(/\/status\/(\d+)/);
  return m?.[1] || null;
}

function buildGraphqlQuery(tweetId) {
  return {
    variables: {
      tweetId,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: false,
    },
    features: {
      creator_subscriptions_tweet_preview_api_enabled: true,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: false,
      tweet_awards_web_tipping_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      responsive_web_media_download_video_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    },
    fieldToggles: {
      withArticleRichContentState: false,
    },
  };
}

async function activateGuestToken() {
  const res = await fetch('https://api.x.com/1.1/guest/activate.json', {
    method: 'POST',
    headers: { Authorization: `Bearer ${BEARER}` },
  });
  if (!res.ok) throw new Error(`Guest token HTTP ${res.status}`);
  const data = await res.json();
  if (!data.guest_token) throw new Error('No guest_token');
  return data.guest_token;
}

function legacyFromGraphql(data) {
  let result = data?.data?.tweetResult?.result;
  if (!result) return null;
  if (result.__typename === 'TweetWithVisibilityResults') {
    result = result.tweet;
  }
  return result?.legacy || null;
}

function itemsFromLegacy(legacy) {
  const items = [];
  const seen = new Set();
  const media = legacy?.extended_entities?.media || legacy?.entities?.media || [];

  for (const m of media) {
    if (m.type === 'photo') {
      const url = `${m.media_url_https || m.media_url}?name=orig`;
      if (!seen.has(url)) {
        seen.add(url);
        items.push(mediaItem({ url, label: 'Photo', kind: 'image' }));
      }
    } else if (m.type === 'video' || m.type === 'animated_gif') {
      const variants = (m.video_info?.variants || [])
        .filter((v) => v.url && v.content_type === 'video/mp4')
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        .filter((v) => {
          if (seen.has(v.url)) return false;
          seen.add(v.url);
          return true;
        })
        .map((v) => ({
          url: v.url,
          label: v.bitrate ? `${Math.round(v.bitrate / 1000)}kbps` : 'MP4',
        }));
      if (!variants.length) continue;
      items.push(
        mediaItem({
          url: variants[0].url,
          label: m.type === 'animated_gif' ? 'GIF' : 'Video',
          kind: 'video',
          variants,
        }),
      );
    }
  }
  return items;
}

/**
 * Public embed endpoint (what cobalt uses as its fallback). Needs no guest
 * token; the `token` is derived from the tweet id.
 */
async function extractViaSyndication(tweetId) {
  const token = ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  const res = await fetch(
    `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}&lang=en`,
  );
  if (!res.ok) throw new Error(`Syndication HTTP ${res.status}`);
  const data = await res.json();
  const media = data.mediaDetails || data.quoted_tweet?.mediaDetails || [];
  return itemsFromLegacy({ extended_entities: { media } });
}

async function extractViaGraphql(tweetId) {
  const guest = await activateGuestToken();
  const query = buildGraphqlQuery(tweetId);
  const endpoint = `https://x.com/i/api/graphql/${GRAPHQL_ENDPOINT}`;
  const params = new URLSearchParams({
    variables: JSON.stringify(query.variables),
    features: JSON.stringify(query.features),
    fieldToggles: JSON.stringify(query.fieldToggles),
  });

  const res = await fetch(`${endpoint}?${params}`, {
    headers: {
      Authorization: `Bearer ${BEARER}`,
      'x-guest-token': guest,
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
    },
  });

  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const legacy = legacyFromGraphql(await res.json());
  if (!legacy) throw new Error('Tweet payload missing');
  return itemsFromLegacy(legacy);
}

export async function extractTwitter(url) {
  const tweetId = tweetIdFromUrl(url);
  if (!tweetId) throw new Error('Not a tweet URL');

  // The syndication endpoint is stable and token-free; GraphQL query ids and
  // feature flags rotate, so it is the fallback rather than the primary.
  const errors = [];
  for (const method of [extractViaSyndication, extractViaGraphql]) {
    try {
      const items = await method(tweetId);
      if (items.length) return items;
      errors.push(`${method.name}: no media`);
    } catch (err) {
      errors.push(`${method.name}: ${err.message}`);
    }
  }
  throw new Error(`No media found in this post (${errors.join('; ')})`);
}
