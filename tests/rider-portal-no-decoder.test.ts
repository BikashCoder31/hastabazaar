import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

let decoderImports = 0;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'sharp') {
      decoderImports++;
      return {
        url: 'data:text/javascript,throw Error("Paused rider routes must not initialize the native image decoder");export default function sharp(){}',
        shortCircuit: true,
      };
    }
    const stubs: Record<string, string> = {
      'cloudflare:workers': 'export const env={}',
      'next/navigation':
        'export function redirect(){throw Error("Authentication reached")}',
      '@/app/auth':
        'export async function getAuthenticatedUser(){throw Error("Authentication reached")};export async function requireAuthenticatedUser(){throw Error("Authentication reached")}',
      '@/lib/auth/customer':
        'export class CustomerAuthorizationError extends Error{};export async function requireCustomerApi(){throw Error("Authentication reached")};export async function getCustomerUser(){throw Error("Authentication reached")}',
      '@/lib/db/d1':
        'export function requireDatabase(){throw Error("Database reached")};export function requireMediaBucket(){throw Error("Private media reached")}',
    };
    return stubs[specifier]
      ? {
          url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
          shortCircuit: true,
        }
      : nextResolve(specifier, context);
  },
});

void test('the actual held upload endpoints respond without loading a native decoder or auth/database bindings', async () => {
  for (const name of ['application', 'reports']) {
    const { POST } = (await import(`../app/api/rider/${name}/route`)) as {
      POST: (request: Request) => Promise<Response>;
    };
    const response = await POST(
      new Request(`https://marketplace.test/api/rider/${name}`, {
        method: 'POST',
        body: 'deliberately malformed',
      }),
    );
    assert.equal(response.status, 503);
    assert.equal(
      ((await response.json()) as { code: string }).code,
      'rider_program_on_hold',
    );
  }
  assert.equal(decoderImports, 0);
});
