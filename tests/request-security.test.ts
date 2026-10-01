import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedMutationRequest } from '../lib/http/request-security';

const publicOrigin = 'https://hastabazaar.com';
function submission(origin: string, extra: Record<string, string> = {}) {
  return new Request('http://127.0.0.1:3000/api/auth/register', {
    method: 'POST',
    headers: { origin, 'sec-fetch-site': 'same-origin', ...extra },
  });
}

void test('HTTPS forms work behind an HTTP hosting proxy for the configured public origin', () => {
  assert.equal(isTrustedMutationRequest(submission(publicOrigin), publicOrigin), true);
});

void test('different schemes, ports, subdomains and attacker origins are rejected', () => {
  for (const origin of [
    'https://attacker.example', 'http://hastabazaar.com',
    'https://hastabazaar.com:444', 'https://other.hastabazaar.com',
    'https://hastabazaar.com.attacker.example', 'null',
    'https://hastabazaar.com/path', 'https://user@hastabazaar.com',
  ]) assert.equal(isTrustedMutationRequest(submission(origin), publicOrigin), false, origin);
});

void test('forwarded headers cannot add a trusted origin and cross-site fetches remain blocked', () => {
  assert.equal(isTrustedMutationRequest(submission('https://attacker.example', {
    'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https',
  }), publicOrigin), false);
  assert.equal(isTrustedMutationRequest(submission(publicOrigin, {
    'sec-fetch-site': 'cross-site',
  }), publicOrigin), false);
});

void test('direct hosting uses its request origin when no public override is configured', () => {
  const request = new Request(`${publicOrigin}/api/auth/login`, {
    method: 'POST', headers: { origin: publicOrigin },
  });
  assert.equal(isTrustedMutationRequest(request, new URL(request.url).origin), true);
});

void test('invalid public-origin configuration fails closed for browser forms', () => {
  for (const value of ['', 'not-a-url', 'null', 'https://hastabazaar.com/path',
    'https://user@hastabazaar.com', 'https://hastabazaar.com?unexpected=true']) {
    assert.equal(isTrustedMutationRequest(submission(publicOrigin), value), false);
  }
});
