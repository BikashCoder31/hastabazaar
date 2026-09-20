export function isTrustedMutationRequest(
  request: Request,
  publicOrigin = process.env.APP_ORIGIN,
): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;

  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    // TLS can terminate at the hosting proxy while Node receives HTTP.
    // Trust an operator-configured origin, never arbitrary forwarded headers.
    const expected = new URL(publicOrigin ?? new URL(request.url).origin);
    if (
      !['https:', 'http:'].includes(expected.protocol) ||
      expected.username || expected.password || expected.pathname !== '/' ||
      expected.search || expected.hash
    ) return false;

    // Origin headers contain only a serialized origin, without paths or credentials.
    return origin === expected.origin;
  } catch {
    return false;
  }
}
