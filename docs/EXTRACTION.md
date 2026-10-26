# Per-site extraction

| Site | OmniDownload | Runs in |
|------|----------------|---------|
| **YouTube** | Innertube `ios` client; fallback `movie_player.getPlayerResponse()` | Content (same-origin) / MAIN-world inject |
| **Reddit** | `/{slug}/.json`, then `<shreddit-post>` DOM | Content (same-origin) |
| **Instagram** | `/api/v1/media/{id}/info/` (login required) | Content (same-origin) |
| **X / Twitter** | `cdn.syndication.twimg.com/tweet-result`, then guest GraphQL | Background |
| **Imgur** | `api.imgur.com/post/v1/media` or `/albums` | Background |
| **Other** | OG, JSON-LD, media elements | Content (generic) |

Reddit link posts to Imgur are resolved by calling the Imgur extractor on the external URL (same idea as chained extractors in CLI tools).

Add a site: background module under `src/background/platforms/`, wire in `extract-router.js`, thin wrapper in `src/sites/`.
