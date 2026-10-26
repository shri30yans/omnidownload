import { extractViaPlatform } from '../core/platform-client.js';
import { registerExtractor } from '../core/registry.js';

registerExtractor({
  id: 'twitter',
  hostSuffixes: ['twitter.com', 'x.com'],
  priority: 50,
  extract: (ctx) => (/\/status\/\d+/.test(ctx.url) ? extractViaPlatform('twitter', ctx.url) : []),
});
