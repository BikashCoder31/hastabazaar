const reservedAuthPaths = new Set([
  '/login',
  '/register',
  '/api/auth/logout',
  '/api/auth/google',
  '/api/auth/google/callback',
]);

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local' || reservedAuthPaths.has(url.pathname)) {
    return '/';
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
