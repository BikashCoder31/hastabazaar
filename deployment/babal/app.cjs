'use strict';

process.env.APP_ORIGIN ??= 'https://hastabazaar.com';

import('./server.js').catch((error) => {
  console.error('[hastabazaar] The standalone server could not start.');
  console.error(error);
  process.exitCode = 1;
});
