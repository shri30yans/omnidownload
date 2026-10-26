import { extractViaPlatform } from '../core/platform-client.js';
import { registerExtractor } from '../core/registry.js';

registerExtractor({
  id: 'imgur',
  hostSuffixes: ['imgur.com', 'i.imgur.com'],
  priority: 45,
  extract: (ctx) => (ctx.location.pathname.length > 1 ? extractViaPlatform('imgur', ctx.url) : []),
});
