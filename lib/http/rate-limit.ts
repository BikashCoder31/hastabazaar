export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export async function requestFingerprint(request: Request, scope: string): Promise<string> {
  const trustedHeader = process.env.TRUSTED_CLIENT_IP_HEADER;
  const forwarded = trustedHeader && ['x-real-ip','cf-connecting-ip'].includes(trustedHeader)
    ? request.headers.get(trustedHeader)?.trim() : undefined;
  const client = scope.includes(':') ? 'account-budget' : forwarded || 'shared-unverified-network';
  const bytes = new TextEncoder().encode(`${scope}\n${client}`);
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
  const scopedLimit = options.limit;
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
    allowed: row.requestCount <= scopedLimit,
    limit: scopedLimit,
    remaining: Math.max(0, scopedLimit - row.requestCount),
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

export async function consumeAuthenticationRateLimit(database: D1Database, request: Request, options: {scope:string;limit:number;windowMs:number;now?:number}) {
 const network=await consumeRequestRateLimit(database,request,{scope:'authentication-network',limit:300,windowMs:15*60_000,now:options.now});
 if(!network.allowed) return network;
 return consumeRequestRateLimit(database,request,options);
}
// When no proxy header has been explicitly trusted, the anonymous network is
// shared. Preserve per-account limits; use a generous aggregate ceiling otherwise.
export async function consumePublicRequestRateLimit(database: D1Database, request: Request, options: {scope:string;limit:number;windowMs:number;now?:number}) {
 const limit=!options.scope.includes(':')&&!['x-real-ip','cf-connecting-ip'].includes(process.env.TRUSTED_CLIENT_IP_HEADER??'')?Math.max(300,options.limit):options.limit;
 return consumeRequestRateLimit(database,request,{...options,limit});
}
