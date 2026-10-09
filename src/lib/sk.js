/* The extension's pure modules, in the extension's own load order. Each one
 * hangs itself on globalThis.SK, so importing them for their side effect is
 * all it takes. Never edit src/shared/sk/: run `npm run sync-core`. */
import '../shared/sk/core-config.js';
import '../shared/sk/core-util.js';
import '../shared/sk/core-rules.js';
import '../shared/sk/core-registry.js';
import '../shared/sk/core-settings.js';
import '../shared/sk/core-profit.js';
import '../shared/sk/core-viagogo.js';
import '../shared/sk/core-team.js';
import '../shared/sk/core-sales.js';
import '../shared/sk/sites-ebileta.js';
import '../shared/sk/sites-efinity.js';
import '../shared/sk/sites-posttick.js';

export const SK = globalThis.SK;
