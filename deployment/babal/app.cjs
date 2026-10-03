'use strict';

process.env.APP_ORIGIN ??= 'https://hastabazaar.com';
// Both public storefront hosts are served by this installation. Keep aliases
// explicit; a custom/staging origin must opt in to its own aliases separately.
function isCanonicalStorefrontOrigin(value) {
  try {
    const origin = new URL(value);
    return origin.origin === 'https://hastabazaar.com' && !origin.username &&
      !origin.password && origin.pathname === '/' && !origin.search && !origin.hash;
  } catch { return false; }
}
process.env.APP_ALLOWED_ORIGINS ??= isCanonicalStorefrontOrigin(process.env.APP_ORIGIN)
  ? 'https://www.hastabazaar.com'
  : '';

import('./server.js').catch((error) => {
  console.error('[hastabazaar] The standalone server could not start.');
  console.error(error);
  process.exitCode = 1;
});
