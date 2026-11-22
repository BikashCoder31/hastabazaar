export const marketplaceSecurityHeaders = {
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'strict-origin-when-cross-origin',
 'Permissions-Policy':'geolocation=(self), camera=(), microphone=()',
 // Inline bootstrap/RSC scripts still require unsafe-inline until per-request
 // nonces are verified across production streaming, navigation and error pages.
 // React uses delegated listeners, so HTML event attributes can be denied now.
 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com; frame-src 'none'",
};
