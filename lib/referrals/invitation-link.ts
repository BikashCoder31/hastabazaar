/** Use only the operator-configured server origin, never request or forwarded headers. */
export function referralInvitationLink(
  code: string,
  configuredOrigin: string | undefined,
): string | null {
  const value = configuredOrigin?.trim();
  if (!value || !/^https?:\/\/[^/?#]+\/?$/i.test(value) || /[\s\\]/.test(value))
    return null;
  try {
    const origin = new URL(value);
    if (
      origin.username ||
      origin.password ||
      origin.hostname.includes('*') ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      return null;
    return new URL(`/r/${encodeURIComponent(code)}`, origin.origin).toString();
  } catch {
    return null;
  }
}
