export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

async function requestFingerprint(request: Request, scope: string): Promise<string> {
  const forwarded = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown-address';
  const agent = request.headers.get('user-agent')?.slice(0, 180) ?? 'unknown-agent';
  const bytes = new TextEncoder().encode(`${scope}\n${forwarded}\n${agent}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function consumeRequestRateLimit(
  database: D1Database,
  request: Request,
  options: { scope: string; limit: number; windowMs: number; now?: number },
): Promise<RateLimitResult> {
  if (!Number.isInteger(options.limit) || options.limit < 1) throw new RangeError('Rate limit must be positive.');
  if (!Number.isInteger(options.windowMs) || options.windowMs < 1_000) throw new RangeError('Rate-limit window must be at least one second.');
  const now = options.now ?? Date.now();
  const expiresAt = now + options.windowMs;
  const key = await requestFingerprint(request, options.scope);
  const row = await database.prepare(
    `INSERT INTO request_rate_limits (key, request_count, window_started_at, expires_at)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       request_count = CASE WHEN request_rate_limits.expires_at <= ? THEN 1 ELSE request_rate_limits.request_count + 1 END,
       window_started_at = CASE WHEN request_rate_limits.expires_at <= ? THEN ? ELSE request_rate_limits.window_started_at END,
       expires_at = CASE WHEN request_rate_limits.expires_at <= ? THEN ? ELSE request_rate_limits.expires_at END
     RETURNING request_count AS requestCount, expires_at AS expiresAt`,
  ).bind(key, now, expiresAt, now, now, now, now, expiresAt).first<{
    requestCount: number;
    expiresAt: number;
  }>();
  if (!row) throw new Error('Rate limit could not be evaluated.');
  return {
    allowed: row.requestCount <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - row.requestCount),
    retryAfterSeconds: Math.max(1, Math.ceil((row.expiresAt - now) / 1_000)),
  };
}

export function rateLimitJson(result: RateLimitResult): Response {
  return Response.json(
    { error: 'Too many requests. Please wait before trying again.' },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    },
  );
}
