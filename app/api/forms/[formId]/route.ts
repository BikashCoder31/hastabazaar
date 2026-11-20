import {StaffAuthorizationError} from '@/lib/auth/staff';
import {requireExistingStaffIntentApi} from '@/lib/auth/staff-intent';
import {ACTOR_INTENT_HEADER} from '@/lib/http/actor-intent';
import { coreFormContract } from '@/lib/forms/core-contracts';
import { isRiderPortalEnabled } from '@/lib/riders/availability';
import { getSellerTermsViewer } from '@/lib/auth/seller-commercial-access';
import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { getStaffPermissionProfile } from '@/lib/db/repositories/staff-permissions';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { can, type Permission } from '@/lib/marketplace/permissions';
import { applicationCapabilities, type ParticipationApplicationStage } from '@/lib/sellers/participation';
import type { FormAudience } from '@/lib/forms/types';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const missing = () => json({ error: 'Form not found.' }, 404);

// A staff audience is not a blanket Admin grant. Entries here mirror the
// corresponding page/action permission. Unlisted staff forms require Super Admin.
const STAFF_FORM_PERMISSIONS: Readonly<Partial<Record<string, Permission|readonly Permission[]>>> = {
  'staff.team-governance': 'account.self.manage',
  'staff.incident-review': 'system.incidents.manage',
  'staff.catalog': 'catalog.manage',
  'staff.exception-work': 'order.manage',
  'staff.governance-rule-create': 'catalog.manage',
  'staff.governance-promotion-create': 'catalog.manage',
  'staff.managed-supply-decision': 'seller.application.review',
  'staff.managed-payment-preparation': 'payout.prepare',
  'staff.managed-transition-decision': 'seller.application.review',
  'staff.parcel-control': 'order.manage',
  'staff.payout-1': 'payout.prepare',
  'staff.payout-request-action': 'payout.prepare',
  'staff.privacy-action': 'support.manage',
  'staff.product-classification': 'catalog.manage',
  'staff.recorded-progress-filter': 'audit_log.view',
  'staff.delivery-assignment': 'order.manage',
  'shipping.console-action-staff': 'order.manage',
  'staff.return-case-action': ['refund.approve.standard','order.manage','support.manage'],
  'staff.complaint-case-action': 'support.manage',
  'staff.cancellation-review': 'order.manage',
  'staff.seller-review-action': 'seller.application.review',
  'staff.seller-registry-filter': 'seller.application.review',
  'staff.order-queue-filter': 'order.manage',
  'staff.order-email-filter': 'order.manage',
  'staff.order-fulfillment': 'order.manage',
  'staff.first-cod-confirmation': 'order.manage',
  'staff.review-moderation': 'product.review',
  'staff.product-review': 'product.review',
};

const applicationStages = new Set<ParticipationApplicationStage>([
  'draft', 'submitted', 'under_review', 'changes_requested',
  'approved_for_activation', 'active', 'rejected', 'suspended',
]);

async function sellerAudienceAllowed(db: D1Database, userId: string, roles: ReadonlySet<string>, formId: string): Promise<boolean> {
  if (formId === 'seller.product-submission') {
    if (!roles.has('customer') && !roles.has('seller')) return false;
    return Boolean(await db.prepare('SELECT 1 AS allowed FROM seller_profiles WHERE user_id=? LIMIT 1').bind(userId).first());
  }
  if (formId === 'seller.managed-transition-request') return roles.has('customer') && Boolean(await db.prepare(`SELECT 1 FROM seller_profiles s
    JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.user_id=? AND p.participation_route='managed_maker' AND p.application_stage='active'
      AND NOT EXISTS(SELECT 1 FROM seller_restrictions r WHERE r.seller_id=s.id AND (r.mode='disabled' OR (r.mode='suspended' AND r.suspended_until>?)))`).bind(userId,Date.now()).first());
  if (formId === 'seller.managed-terms-acceptance') {
    return roles.has('customer') && Boolean(await db.prepare(`SELECT 1 FROM seller_profiles s
      JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.user_id=?
        AND p.participation_route='managed_maker' AND p.application_stage NOT IN ('rejected','suspended')`)
      .bind(userId).first());
  }
  if (formId === 'seller.maker-profile' || formId === 'seller.product-submission') {
    if (roles.has('customer')) {
      const participation = await db.prepare(`SELECT p.application_stage AS applicationStage
        FROM seller_profiles s JOIN seller_participation_profiles p ON p.seller_id = s.id
        WHERE s.user_id = ? LIMIT 1`).bind(userId).first<{ applicationStage: string }>();
      const stage = participation?.applicationStage;
      if (stage && applicationStages.has(stage as ParticipationApplicationStage)) {
        const capabilities = applicationCapabilities(stage as ParticipationApplicationStage, 'applications_only');
        if (formId === 'seller.maker-profile' ? capabilities.editProfile : capabilities.prepareProductDrafts) return true;
      }
    }
    if (formId === 'seller.maker-profile') return false;
  }
  if (!roles.has('seller')) return false;
  const approved = await db.prepare(`SELECT 1 AS allowed FROM seller_profiles
    WHERE user_id = ? AND status = 'approved' LIMIT 1`).bind(userId).first<{ allowed: number }>();
  return Boolean(approved);
}

async function riderAudienceAllowed(db: D1Database, userId: string, roles: ReadonlySet<string>, formId: string): Promise<boolean> {
  if (!roles.has('customer')) return false;
  const profile = await db.prepare('SELECT status FROM rider_profiles WHERE user_id = ?')
    .bind(userId).first<{ status: string }>();
  return formId === 'rider.application'
    ? !profile || profile.status === 'rejected'
    : profile?.status === 'approved';
}

async function audienceAllowed(audience: FormAudience, formId: string): Promise<boolean> {
  if (formId === 'seller.application') return Boolean(await getSellerTermsViewer());
  if (audience === 'public') return true;
  try {
    const identity = await getAuthenticatedUser();
    if (!identity) return false;
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const rows = await db.prepare(`SELECT u.id, r.role FROM users u JOIN user_roles r ON r.user_id = u.id
      WHERE u.auth_subject = ? AND u.status = 'active'`).bind(identity.userId).all<{ id: string; role: string }>();
    const roles = new Set(rows.results.map((row) => row.role));
    const userId = rows.results[0]?.id;
    if (!userId) return false;
    // These exact published customer contracts also back the protected support
    // intake receiver. This reads configuration only; native case mutations keep
    // their order/source/permission checks and other customer forms stay private.
    if(audience==='customer'&&['commerce.complaint','commerce.return-request'].includes(formId)&&(roles.has('super_admin')||roles.has('admin'))){
      if(roles.has('super_admin'))return true;
      const profile=await getStaffPermissionProfile(db,userId);
      if(can({role:'admin',permissions:profile.permissions},'support.manage'))return true;
    }
    if (audience === 'super_admin') return roles.has('super_admin');
    if (audience === 'staff') {
      if (roles.has('super_admin')) return true;
      if (!roles.has('admin')) return false;
      const permission = STAFF_FORM_PERMISSIONS[formId];
      if (!permission) return false;
      const profile = await getStaffPermissionProfile(db, userId);
      return (typeof permission==='string'?[permission]:permission).some(value=>can({ role: 'admin', permissions: profile.permissions }, value));
    }
    if (audience === 'seller') return sellerAudienceAllowed(db, userId, roles, formId);
    if (audience === 'rider') return riderAudienceAllowed(db, userId, roles, formId);
    return roles.has('customer');
  } catch { return false; }
}

async function readPublishedForm(_request: Request, context: { params: Promise<{ formId: string }> }): Promise<Response> {
  const { formId } = await context.params;
  const definition = Object.hasOwn(FORM_REGISTRY, formId) ? FORM_REGISTRY[formId] : null;
  if (!definition) return missing();
  if (definition.audience === 'rider' && !isRiderPortalEnabled()) return missing();
  if (!await audienceAllowed(definition.audience, formId)) return missing();
  try {
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const row = await db.prepare(`SELECT 1 AS found FROM form_config_versions
      WHERE form_id = ? AND status = 'published' LIMIT 1`).bind(formId).first<{ found: number }>();
    if (!row && !coreFormContract(formId)) return missing();
    const config = await resolvePublishedForm(db, formId);
    if (!await audienceAllowed(definition.audience, formId)) return missing();
    return json({ config }, 200);
  } catch (error) {
    if (!await audienceAllowed(definition.audience, formId)) return missing();
    return json({ error: 'Form configuration is unavailable.', code: error instanceof FormRuntimeError ? error.code : 'config_unavailable', category: error instanceof FormRuntimeError ? error.category??'configuration_unavailable' : 'configuration_unavailable', ...(error instanceof FormRuntimeError && error.supportReference ? {supportReference:error.supportReference} : {}) }, 503);
  }
}

// Existing callers retain the same concealed404 contract. These rendered Team
// controls opt into an explicit current actor/SA boundary, without provisioning.
// Incident controls separately opt into their native delegated responder grant.
const TEAM_INTENT_FORMS=new Set(['staff.staff-invitation','staff.staff-permission-1','staff.staff-permission-2']);
export async function GET(request:Request,context:{params:Promise<{formId:string}>}):Promise<Response>{
 const {formId}=await context.params,resolved={params:Promise.resolve({formId})};
 const incident=formId==='staff.incident-review';
 if((!TEAM_INTENT_FORMS.has(formId)&&!incident)||!request.headers.has(ACTOR_INTENT_HEADER))return readPublishedForm(request,resolved);
 try{
  const permission=incident?'system.incidents.manage':'account.self.manage',original=await requireExistingStaffIntentApi(request,permission);
  if(!incident&&original.role!=='super_admin')throw new StaffAuthorizationError('Current Super Admin access is required. Reopen Team.',403);
  const response=await readPublishedForm(request,resolved);
  const current=await requireExistingStaffIntentApi(request,permission);
  if(current.role!==original.role||current.id!==original.id||current.authSubject!==original.authSubject||(incident&&JSON.stringify([...(current.permissions??[])].sort())!==JSON.stringify([...(original.permissions??[])].sort())))throw new StaffAuthorizationError('Current '+(incident?'Incident':'Team')+' access changed. Reopen the workspace.',403);
  return response;
 }catch(error){
  if(error instanceof StaffAuthorizationError)return json({error:error.message},error.status);
  return json({error:'Current '+(incident?'Incident':'Team')+' form access could not be checked.'},503);
 }
}
