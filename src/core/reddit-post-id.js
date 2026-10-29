/** Post id from `/comments/{id}/` in Reddit URLs. */
export function redditPostIdFromUrl(url) {
  return url.match(/\/comments\/([a-z0-9]+)/i)?.[1]?.toLowerCase() || null;
}
