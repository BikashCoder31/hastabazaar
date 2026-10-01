import { createHash, randomBytes } from 'node:crypto';

import { createRemoteJWKSet, jwtVerify } from 'jose';

import { safeRelativeReturnPath } from '@/lib/http/safe-return';

const googleIssuer = ['https://accounts.google.com', 'accounts.google.com'];
const googleKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const flowCookieName = 'hastabazaar_google_oauth';

export type GoogleConfiguration = {
  clientId: string;
  clientSecret: string;
  appOrigin: string;
  redirectUri: string;
};

type FlowCookie = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  createdAt: number;
};

export type GoogleIdentity = {
  subject: string;
  email: string;
  displayName: string;
};

function randomValue(bytes = 32): string {
  return Buffer.from(randomBytes(bytes)).toString('base64url');
}

export function googleConfiguration(environment: {
  APP_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}): GoogleConfiguration | null {
  const clientId = environment.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim();
  const appOrigin = environment.APP_ORIGIN?.trim().replace(/\/$/, '');
  if (!clientId || !clientSecret || !appOrigin || !appOrigin.startsWith('https://')) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    appOrigin,
    redirectUri: `${appOrigin}/api/auth/google/callback`,
  };
}

export function beginGoogleFlow(
  configuration: GoogleConfiguration,
  returnToValue: string,
  now = Date.now(),
): { location: string; cookie: string } {
  const flow: FlowCookie = {
    state: randomValue(),
    nonce: randomValue(),
    verifier: randomValue(48),
    returnTo: safeRelativeReturnPath(returnToValue),
    createdAt: now,
  };
  const challenge = createHash('sha256').update(flow.verifier).digest('base64url');
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.searchParams.set('client_id', configuration.clientId);
  authorization.searchParams.set('redirect_uri', configuration.redirectUri);
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('scope', 'openid email profile');
  authorization.searchParams.set('state', flow.state);
  authorization.searchParams.set('nonce', flow.nonce);
  authorization.searchParams.set('code_challenge', challenge);
  authorization.searchParams.set('code_challenge_method', 'S256');
  authorization.searchParams.set('prompt', 'select_account');
  const encoded = Buffer.from(JSON.stringify(flow)).toString('base64url');
  return {
    location: authorization.toString(),
    cookie: `${flowCookieName}=${encoded}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  };
}

function cookieValue(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  return (
    (request.headers.get('cookie') ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

export function clearGoogleFlowCookie(): string {
  return `${flowCookieName}=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readGoogleFlow(request: Request, now = Date.now()): FlowCookie | null {
  const encoded = cookieValue(request, flowCookieName);
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as FlowCookie;
    if (
      !parsed.state ||
      !parsed.nonce ||
      !parsed.verifier ||
      !parsed.returnTo ||
      now - parsed.createdAt > 10 * 60_000 ||
      parsed.createdAt > now + 60_000
    ) {
      return null;
    }
    return { ...parsed, returnTo: safeRelativeReturnPath(parsed.returnTo) };
  } catch {
    return null;
  }
}

export async function finishGoogleFlow(options: {
  configuration: GoogleConfiguration;
  code: string;
  flow: FlowCookie;
}): Promise<GoogleIdentity> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: options.code,
      client_id: options.configuration.clientId,
      client_secret: options.configuration.clientSecret,
      redirect_uri: options.configuration.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: options.flow.verifier,
    }),
  });
  if (!tokenResponse.ok) throw new Error('Google token exchange failed.');
  const tokens = (await tokenResponse.json()) as { id_token?: unknown };
  if (typeof tokens.id_token !== 'string') throw new Error('Google did not return an identity token.');
  const { payload } = await jwtVerify(tokens.id_token, googleKeys, {
    issuer: googleIssuer,
    audience: options.configuration.clientId,
  });
  if (
    payload.nonce !== options.flow.nonce ||
    payload.email_verified !== true ||
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string'
  ) {
    throw new Error('Google identity verification failed.');
  }
  return {
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    displayName:
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim().slice(0, 100)
        : payload.email.split('@')[0].slice(0, 100),
  };
}
