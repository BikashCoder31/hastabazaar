import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { validateFormDraft } from '../lib/forms/validation';

declare global {
  var governanceCatalogConfigs: Record<string, unknown>;
  var governanceCreateElement: typeof createElement;
  var governanceActor: { id: string; role: 'admin' | 'super_admin' } | null;
}
globalThis.governanceCreateElement = createElement;

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/link') return { url: `data:text/javascript,export default function Link({children,...props}){return globalThis.governanceCreateElement('a',props,children)}`, shortCircuit: true };
  if (specifier === 'next/navigation') return { url: 'data:text/javascript,export function useRouter(){return {refresh(){}}}', shortCircuit: true };
  if (specifier === '@/components/forms/form-config-client') return { url: 'data:text/javascript,export function usePublishedFormConfig(id){return {config:globalThis.governanceCatalogConfigs[id],canSubmit:true,status:"ready",message:""}}', shortCircuit: true };
  if (specifier === '@/components/ui/tabs') return { url: `data:text/javascript,
    export const Tabs=({children})=>globalThis.governanceCreateElement('div',null,children);
    export const TabsContent=({children})=>globalThis.governanceCreateElement('div',null,children);
    export const TabsList=({children})=>globalThis.governanceCreateElement('div',null,children);
    export const TabsTrigger=({children})=>globalThis.governanceCreateElement('button',null,children);`, shortCircuit: true };
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={DB:{prepare(){throw Error("Unexpected database access")}}}', shortCircuit: true };
  if (specifier === '@/lib/auth/staff') return { url: `data:text/javascript,
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}}
    export async function requireStaffApi(){if(!globalThis.governanceActor)throw new StaffAuthorizationError('Staff access required.',403);return globalThis.governanceActor}`, shortCircuit: true };
  if (specifier === '@/lib/db/repositories/operations') return { url: `data:text/javascript,
    export class OperationsConflictError extends Error{}
    export async function performGovernanceAction(){return}`, shortCircuit: true };
  if (specifier === '@/lib/http/request-security') return { url: 'data:text/javascript,export function isTrustedMutationRequest(){return true}', shortCircuit: true };
  return nextResolve(specifier, context);
} });

const formIds = [
  'staff.governance-rule-create',
  'staff.governance-promotion-create',
  'staff.governance-incident-create',
  'staff.governance-incident-update',
  'staff.governance-backup-verify',
] as const;

void test('all five governance forms protect every console and request built-in alias', () => {
  const baseKeys = ['action','requestId','formVersion','customAnswers','id','code','titleEn',
    'titleNe','descriptionEn','descriptionNe','severity','isActive','nameEn','nameNe',
    'placement','startsAt','endsAt','note','productIds','title','detail','status',
    'resolution','scope','evidenceReference'];
  const canonical = (key: string) => key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  for (const formId of formIds) {
    assert.equal(IMPLEMENTED_FORM_ADAPTERS[formId]?.route, '/api/admin/governance', formId);
    const protectedKeys = new Set(FORM_REGISTRY[formId].baseFields
      .filter((field) => field.capability === 'protected').map((field) => canonical(field.key)));
    for (const key of baseKeys) assert.ok(protectedKeys.has(canonical(key)), `${formId}:${key}`);
    assert.throws(() => validateFormDraft(formId, { formId, fields: [{
      id: 'request_id', key: 'request_id', type: 'short_text', label: 'Request ID',
      required: true, order: 0, status: 'active',
    }] }));
  }
});

void test('all five governance forms render their own published controls and version', async () => {
  globalThis.governanceCatalogConfigs = Object.fromEntries(formIds.map((formId) => [formId, {
    formId, version: 2, publishedAt: 1, fields: [{ id: 'review_context', key: 'review_context',
      label: 'Review context', type: 'short_text', required: true, order: 0, status: 'active' }],
  }]));
  const { GovernanceConsole } = await import('../components/admin/governance-console');
  const html = renderToStaticMarkup(createElement(GovernanceConsole, {
    data: { users: [], rules: [{ id: 'rule-one', code: 'CODE', titleEn: 'Fixture', titleNe: 'Fixture', severity: 'restricted', isActive: 1 }],
      products: [], promotions: [], incidents: [{ id: 'incident-one', referenceNumber: 'INC-1', title: 'Fixture', severity: 'high', status: 'open', resolution: null }], backups: [] },
    superAdmin: true, actorId: 'super-one',
  }));
  for (const formId of formIds) {
    const form = html.match(new RegExp(`<form[^>]*data-form-id="${formId}"[\\s\\S]*?<\\/form>`))?.[0];
    assert.ok(form, `${formId} must identify its live form`);
    assert.match(form, /name="custom\.review_context"/);
    assert.match(form, /name="formVersion" value="2"/);
  }
});
void test('Super Admin sees decisions on their own prepared promotion and staff proposal while own permission targets stay blocked', async () => {
  globalThis.governanceCatalogConfigs = Object.fromEntries([...formIds, 'staff.staff-permission-1', 'staff.staff-permission-2'].map(formId => [formId, { formId, version: 1, publishedAt: 1, fields: [] }]));
  const { GovernanceConsole } = await import('../components/admin/governance-console');
  const data = { users: [], rules: [], products: [], incidents: [], backups: [], promotions: [{
    id: 'same-super-promotion', nameEn: 'Prepared placement', nameNe: 'Prepared placement', placement: 'homepage', status: 'pending_approval',
    startsAt: 100, endsAt: 200, createdBy: 'super-one', creatorName: 'Super Admin', approverName: null,
  }] };
  const superHtml = renderToStaticMarkup(createElement(GovernanceConsole, { data, superAdmin: true, actorId: 'super-one' }));
  assert.match(superHtml, /Approve placement/);
  assert.match(superHtml, /Reject proposal/);
  const adminHtml = renderToStaticMarkup(createElement(GovernanceConsole, { data, superAdmin: false, actorId: 'admin-one' }));
  assert.doesNotMatch(adminHtml, /Approve placement|Reject proposal/);
  const { StaffPermissionManager } = await import('../components/admin/staff-permission-manager');
  const request = { id: 'same-super-permission', userId: 'admin-one', permissionsJson: '[]', expectedVersion: 0,
    presetName: null, reason: 'Restrict operational access', proposedBy: 'super-one', proposedAt: 100,
    status: 'pending' as const, decidedBy: null, decisionNote: null };
  const staffHtml = renderToStaticMarkup(createElement(StaffPermissionManager, { actorId: 'super-one', members: [], requests: [request], presets: [] }));
  assert.match(staffHtml, /value="approve"/);
  assert.match(staffHtml, /value="reject"/);
  const ownHtml = renderToStaticMarkup(createElement(StaffPermissionManager, { actorId: 'super-one', members: [], requests: [{ ...request, userId: 'super-one' }], presets: [] }));
  assert.doesNotMatch(ownHtml, /value="approve"|value="reject"/);
});

void test('governance route refuses an unversioned form before a domain action', async () => {
  globalThis.governanceActor = { id: 'admin-one', role: 'admin' };
  const { POST } = await import('../app/api/admin/governance/route');
  const response = await POST(new Request('http://localhost/api/admin/governance', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'rule.create', requestId: 'rule-one', data: {
      code: 'CODE', titleEn: 'Example', descriptionEn: 'A valid long description', severity: 'restricted',
    } }),
  }));
  assert.equal(response.status, 400);
});

void test('governance route rejects malformed and streamed oversized JSON before domain work', async () => {
  globalThis.governanceActor = { id: 'admin-one', role: 'admin' };
  const { POST } = await import('../app/api/admin/governance/route');
  const malformed = await POST(new Request('http://localhost/api/admin/governance', {
    method:'POST',headers:{'content-type':'application/json'},body:'{"action":',
  }));
  assert.equal(malformed.status,400);
  const chunk = new Uint8Array(8192).fill(65);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (sent++ < 33) controller.enqueue(chunk);
    else controller.close();
  } });
  const oversized = await POST(new Request('http://localhost/api/admin/governance', {
    method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half',
  } as RequestInit & {duplex:'half'}));
  assert.equal(oversized.status,413);
});
