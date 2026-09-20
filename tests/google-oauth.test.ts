import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginGoogleFlow,
  googleConfiguration,
  readGoogleFlow,
} from '../lib/auth/google-oauth';

void test('Google OAuth requires complete HTTPS configuration', () => {
  assert.equal(googleConfiguration({}), null);
  assert.equal(
    googleConfiguration({
      APP_ORIGIN: 'http://hastabazaar.com',
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
    }),
    null,
  );
  assert.deepEqual(
    googleConfiguration({
      APP_ORIGIN: 'https://hastabazaar.com/',
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
    }),
    {
      appOrigin: 'https://hastabazaar.com',
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://hastabazaar.com/api/auth/google/callback',
    },
  );
});

void test('Google OAuth flow uses state, nonce, PKCE, and a safe return path', () => {
  const configuration = googleConfiguration({
    APP_ORIGIN: 'https://hastabazaar.com',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
  });
  assert.ok(configuration);
  const started = beginGoogleFlow(configuration, '//attacker.example', 1_000);
  const location = new URL(started.location);
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('redirect_uri'), configuration.redirectUri);
  assert.equal(location.searchParams.get('scope'), 'openid email profile');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const cookie = started.cookie.split(';')[0];
  const request = new Request(configuration.redirectUri, { headers: { cookie } });
  const flow = readGoogleFlow(request, 1_001);
  assert.ok(flow);
  assert.equal(flow.returnTo, '/');
  assert.equal(location.searchParams.get('state'), flow.state);
  assert.equal(location.searchParams.get('nonce'), flow.nonce);
  assert.equal(readGoogleFlow(request, 11 * 60_000), null);
});
