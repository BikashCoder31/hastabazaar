import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

declare global { var continuationGatePath: string; var continuationPending: boolean; }
registerHooks({ resolve(specifier, context, next) {
  const modules: Record<string, string> = {
    'next/navigation': 'export function redirect(path){throw new Error("REDIRECT:"+path)}',
    '@/app/auth': 'export async function requireAuthenticatedUser(path){globalThis.continuationGatePath=path;if(globalThis.continuationPending)throw new Error("MFA_REQUIRED");return {userId:"fictional-staff"}}',
    '@/lib/auth/staff': 'export async function getStaffUser(){return {id:"fictional-staff"}}',
    '@/lib/auth/seller': 'export async function getSellerUser(){throw new Error("Unnecessary seller lookup")}',
  };
  if (modules[specifier]) return {url:'data:text/javascript,'+modules[specifier],shortCircuit:true};
  return next(specifier,context);
} });

void test('staff continuation preserves a public destination only after the authentication gate', async () => {
  const Page = (await import('../app/auth/continue/page')).default;
  globalThis.continuationPending = true;
  await assert.rejects(Page({searchParams:Promise.resolve({return_to:'/sell?route=business'})}), /MFA_REQUIRED/);
  assert.equal(globalThis.continuationGatePath, '/sell?route=business');
  globalThis.continuationPending = false;
  await assert.rejects(Page({searchParams:Promise.resolve({return_to:'/sell?route=business'})}), /^Error: REDIRECT:\/sell\?route=business$/);
});

void test('default and unsafe continuation destinations use role routing without a redirect loop', async () => {
  const Page = (await import('../app/auth/continue/page')).default;
  globalThis.continuationPending = false;
  for (const return_to of [undefined, 'https://outside.example', '/auth/continue?return_to=%2Fsell', ['/sell', '/']]) {
    await assert.rejects(Page({searchParams:Promise.resolve({return_to})}), /^Error: REDIRECT:\/admin$/);
    assert.equal(globalThis.continuationGatePath, '/auth/continue');
  }
});
