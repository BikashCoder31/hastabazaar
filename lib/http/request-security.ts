export function isTrustedMutationRequest(
  request: Request,
  publicOrigin = process.env.APP_ORIGIN,
  allowedOrigins = process.env.APP_ALLOWED_ORIGINS,
): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    // TLS can terminate at the hosting proxy while Node receives HTTP.
    // Trust an operator-configured origin, never arbitrary forwarded headers.
    const configured = [publicOrigin ?? new URL(request.url).origin,
      ...(allowedOrigins ? allowedOrigins.split(',').map((value) => value.trim()) : [])];
    if (configured.length > 16) return false;
    const trusted = configured.map((value) => {
      const expected = new URL(value);
      if (!['https:', 'http:'].includes(expected.protocol) ||
        expected.hostname.includes('*') || expected.username || expected.password ||
        expected.pathname !== '/' || expected.search || expected.hash) {
        throw new Error('Invalid public origin configuration.');
      }
      return expected.origin;
    });

    // Origin headers contain only a serialized origin, without paths or credentials.
    return trusted.includes(origin);
  } catch {
    return false;
  }
}
