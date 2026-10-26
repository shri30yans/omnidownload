export function redditSlugFromUrl(url) {
  const m = url.match(
    /reddit(?:media)?\.com\/((?:(?:r|user)\/[^/]+\/)?comments\/[^/?#&]+)/i,
  );
  return m?.[1]?.replace(/\/$/, '') || null;
}
