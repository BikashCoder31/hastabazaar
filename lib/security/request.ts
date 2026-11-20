import { env } from 'cloudflare:workers';
import { createHash, randomBytes } from 'node:crypto';
import { getLocalTestIdentity } from '../auth/local-test-access';
import {
  hasExpiredHostedStaffSession,
  hostedSessionCookie,
  hostedSessionHash,
  readHostedSession,
  verifyPassword,
} from '../auth/hosted-session';
import { SESSION_EXPIRED_MESSAGE } from '../auth/sign-in-destination';
import { readBoundedBody } from '../http/bounded-body';
import { isTrustedMutationRequest } from '../http/request-security';
import { consumeAuthenticationRateLimit } from '../http/rate-limit';
import {hasActorIntentMismatch} from '../http/actor-intent';
import { requireDatabase } from '../db/d1';
import { ADMIN_ABSOLUTE_MS } from './model';
import { SecurityStateError } from './crypto';
import { SecurityStore } from './store';
import {
  readSecurityInitialization,
  type SecurityPolicyBindings,
} from './runtime-policy';

export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
};
export class SecurityRequestError extends Error {
  constructor(
    message: string,
    readonly status = 403,
    readonly code = 'SECURITY_REQUIRED',
  ) {
    super(message);
  }
}
export function securityBindings() {
  return env as unknown as SecurityPolicyBindings & {
    DB?: D1Database;
    EMAIL?: {
      configured?: boolean;
      send(message: {
        to: string;
        from?: string;
        subject: string;
        text: string;
      }): Promise<unknown>;
    };
  };
}
export type SecurityActor = {
  id: string;
  authSubject: string;
  email: string;
  displayName: string;
  role: 'admin' | 'super_admin' | 'seller';
  sessionHash: string | null;
  raw: Awaited<ReturnType<typeof readHostedSession>>;
  localSimulation: boolean;
};
export function text(data: Record<string, unknown>, key: string, max = 256) {
  const value = data[key];
  return typeof value === 'string' && value.length <= max ? value : '';
}
export async function securityActor(
  request: Request,
): Promise<{
  db: D1Database;
  actor: SecurityActor;
  key: string | undefined;
  initialized: boolean;
}> {
  const bindings = securityBindings(),
    db = requireDatabase(bindings),
    hosted = await readHostedSession(db, request.headers);
  const fixture = getLocalTestIdentity(request.headers);
  const subject = fixture?.userId || hosted?.userId;
  const raw = hosted?.userId === subject ? hosted : null;
  if (!subject) {
    if (await hasExpiredHostedStaffSession(db, request.headers))
      throw new SecurityRequestError(SESSION_EXPIRED_MESSAGE, 401, 'SESSION_EXPIRED');
    throw new SecurityRequestError(
      'Sign in to your existing account first.',
      401,
    );
  }
  const row = await db
    .prepare(
      `SELECT u.id,u.auth_subject AS authSubject,u.email,u.display_name AS displayName,r.role FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.auth_subject=? AND u.status='active' AND r.role IN ('admin','super_admin','seller') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1`,
    )
    .bind(subject)
    .first<Omit<SecurityActor, 'sessionHash' | 'raw' | 'localSimulation'>>();
  if (!row)
    throw new SecurityRequestError(
      'An existing seller or staff account is required.',
    );
  if(hasActorIntentMismatch(request,row.id))throw new SecurityRequestError('The signed-in account changed. Reload security for the current account.',403,'ACTOR_CHANGED');
  const host = new URL(request.url).hostname;
  const localSimulation =
    bindings.HASTABAZAAR_RUNTIME_ENV === 'local_staging' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(host) &&
    process.env.NODE_ENV !== 'production' &&
    /@local\.hastabazaar\.test$/i.test(row.email);
  return {
    db,
    key: bindings.HASTABAZAAR_SECURITY_KEY,
    initialized: await readSecurityInitialization(bindings),
    actor: {
      ...row,
      raw,
      sessionHash: raw ? hostedSessionHash(request.headers) : null,
      localSimulation,
    },
  };
}
export function requiredStore(
  db: D1Database,
  key: string | undefined,
  initialized = false,
) {
  if (!key)
    throw new SecurityRequestError(
      'Restart through the checked local launcher to load the protected security key. No account has been enrolled.',
      503,
      'SECURITY_KEY_UNAVAILABLE',
    );
  return new SecurityStore(db, key, initialized);
}
export async function initializeForStaff(
  store: SecurityStore,
  actor: SecurityActor,
) {
  let manifest = await store.readManifest();
  if (!manifest) {
    const rows = await store.database
      .prepare(
        "SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin')",
      )
      .all<{ id: string }>();
    if (!rows.results.length)
      throw new SecurityRequestError(
        'Account security must first be initialized by the owner.',
        503,
      );
    await store.initialize(rows.results.map((r) => r.id));
    manifest = await store.readManifest();
  }
  if (!manifest?.value.userIds.includes(actor.id))
    await store.registerStaff(
      actor.id,
      Date.now(),
      liveActorGuards(store.database, actor),
    );
}
export async function securityMutation(request: Request, scope: string) {
  if (
    !request.headers.get('origin') ||
    !isTrustedMutationRequest(request, securityBindings().APP_ORIGIN)
  )
    throw new SecurityRequestError('Cross-site requests are not allowed.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new SecurityRequestError(
      'Use the security form to submit this request.',
      415,
    );
  let data: unknown;
  try {
    data = JSON.parse(
      new TextDecoder().decode(await readBoundedBody(request, 8192)),
    );
  } catch {
    throw new SecurityRequestError(
      'The security request is invalid or too large.',
      413,
    );
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new SecurityRequestError('Invalid security form.', 422);
  const context = await securityActor(request);
  const rate = await consumeAuthenticationRateLimit(context.db, request, {
    scope: `security-${scope}:${context.actor.id}`,
    limit: scope === 'bootstrap' ? 5 : 10,
    windowMs: 10 * 60000,
  });
  if (!rate.allowed)
    throw new SecurityRequestError(
      'Too many attempts. Wait before trying again.',
      429,
      'RATE_LIMIT',
    );
  return { ...context, data: data as Record<string, unknown> };
}
export async function freshPassword(
  db: D1Database,
  actor: SecurityActor,
  password: string,
) {
  const credential = await db
    .prepare(
      'SELECT password_hash AS hash,password_salt AS salt FROM user_credentials WHERE user_id=?',
    )
    .bind(actor.id)
    .first<{ hash: string; salt: string }>();
  if (
    !credential ||
    !(await verifyPassword(password, credential.hash, credential.salt))
  )
    throw new SecurityRequestError(
      'The password is incorrect or this account still needs first-password setup.',
      422,
    );
  return credential;
}
export function liveActorGuards(
  db: D1Database,
  actor: SecurityActor,
  passwordHash?: string,
  requireNoPassword = false,
): D1PreparedStatement[] {
  const guard = Buffer.from(randomBytes(16)).toString('hex');
  return [
    db
      .prepare(
        `INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role IN ('admin','super_admin','seller')) AND (? IS NULL OR EXISTS(SELECT 1 FROM user_credentials WHERE user_id=? AND password_hash=?)) AND (?=0 OR NOT EXISTS(SELECT 1 FROM user_credentials WHERE user_id=?)) THEN 1 ELSE 0 END`,
      )
      .bind(
        guard,
        actor.id,
        actor.authSubject,
        passwordHash ?? null,
        actor.id,
        passwordHash ?? null,
        requireNoPassword ? 1 : 0,
        actor.id,
      ),
    db
      .prepare('DELETE FROM operation_transaction_guards WHERE id=?')
      .bind(guard),
  ];
}
export function newSecuritySession(
  db: D1Database,
  actor: SecurityActor,
  passwordHash: string,
  now: number,
  revokeAll = false,
) {
  const token = Buffer.from(randomBytes(32)).toString('base64url'),
    hash = createHash('sha256').update(token).digest('hex');
  const statements = [
    ...liveActorGuards(db, actor, passwordHash),
    db
      .prepare(
        'INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?)',
      )
      .bind(hash, actor.id, now + ADMIN_ABSOLUTE_MS, now, now),
  ];
  if (revokeAll)
    statements.push(
      db
        .prepare('DELETE FROM user_sessions WHERE user_id=? AND token_hash<>?')
        .bind(actor.id, hash),
    );
  else if (actor.sessionHash)
    statements.push(
      db
        .prepare('DELETE FROM user_sessions WHERE user_id=? AND token_hash=?')
        .bind(actor.id, actor.sessionHash),
    );
  return {
    token,
    hash,
    statements,
    cookie: hostedSessionCookie(token, 8 * 3600),
  };
}
export function securityResponse(
  value: unknown,
  status = 200,
  cookie?: string | string[],
) {
  const headers = new Headers(privateHeaders);
  for (const value of cookie ? (Array.isArray(cookie) ? cookie : [cookie]) : [])
    headers.append('Set-Cookie', value);
  return Response.json(value, { status, headers });
}
export function securityFailure(error: unknown) {
  if (error instanceof SecurityRequestError)
    return securityResponse(
      { error: error.message, code: error.code },
      error.status,
    );
  if (error instanceof SecurityStateError)
    return securityResponse(
      { error: error.message, code: 'SECURITY_STATE' },
      409,
    );
  return securityResponse(
    {
      error:
        'The security operation could not finish. Existing account access and records have been preserved.',
      code: 'SECURITY_UNAVAILABLE',
    },
    503,
  );
}
