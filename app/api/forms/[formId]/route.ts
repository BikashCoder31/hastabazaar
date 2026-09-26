import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { getStaffPermissionProfile } from '@/lib/db/repositories/staff-permissions';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { resolvePublishedForm } from '@/lib/forms/runtime';
import { can, type Permission } from '@/lib/marketplace/permissions';
import { applicationCapabilities, type ParticipationApplicationStage } from '@/lib/sellers/participation';
import type { FormAudience } from '@/lib/forms/types';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const missing = () => json({ error: 'Form not found.' }, 404);

// A staff audience is not a blanket Admin grant. Entries here mirror the
// corresponding page/action permission. Unlisted staff forms require Super Admin.
const STAFF_FORM_PERMISSIONS: Readonly<Partial<Record<string, Permission>>> = {
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
  'staff.rider-control-1': 'order.manage',
  'staff.delivery-assignment': 'order.manage',
  'shipping.console-action-staff': 'order.manage',
  'staff.return-case-action': 'refund.approve.standard',
  'staff.complaint-case-action': 'support.manage',
  'staff.cancellation-review': 'order.manage',
  'staff.seller-review-action': 'seller.application.review',
  'staff.order-fulfillment': 'order.manage',
  'staff.review-moderation': 'product.review',
  'staff.product-review': 'product.review',
};

const applicationStages = new Set<ParticipationApplicationStage>([
  'draft', 'submitted', 'under_review', 'changes_requested',
  'approved_for_activation', 'active', 'rejected', 'suspended',
]);

async function sellerAudienceAllowed(db: D1Database, userId: string, roles: ReadonlySet<string>, formId: string): Promise<boolean> {
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
  if (audience === 'public' || formId === 'seller.application') return true;
  try {
    const identity = await getAuthenticatedUser();
    if (!identity) return false;
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const rows = await db.prepare(`SELECT u.id, r.role FROM users u JOIN user_roles r ON r.user_id = u.id
      WHERE u.auth_subject = ? AND u.status = 'active'`).bind(identity.userId).all<{ id: string; role: string }>();
    const roles = new Set(rows.results.map((row) => row.role));
    const userId = rows.results[0]?.id;
    if (!userId) return false;
    if (audience === 'super_admin') return roles.has('super_admin');
    if (audience === 'staff') {
      if (roles.has('super_admin')) return true;
      if (!roles.has('admin')) return false;
      const permission = STAFF_FORM_PERMISSIONS[formId];
      if (!permission) return false;
      const profile = await getStaffPermissionProfile(db, userId);
      return can({ role: 'admin', permissions: profile.permissions }, permission);
    }
    if (audience === 'seller') return sellerAudienceAllowed(db, userId, roles, formId);
    if (audience === 'rider') return riderAudienceAllowed(db, userId, roles, formId);
    return roles.has('customer');
  } catch { return false; }
}

export async function GET(_request: Request, context: { params: Promise<{ formId: string }> }): Promise<Response> {
  const { formId } = await context.params;
  const definition = Object.hasOwn(FORM_REGISTRY, formId) ? FORM_REGISTRY[formId] : null;
  if (!definition) return missing();
  if (!await audienceAllowed(definition.audience, formId)) return missing();
  try {
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const row = await db.prepare(`SELECT 1 AS found FROM form_config_versions
      WHERE form_id = ? AND status = 'published' LIMIT 1`).bind(formId).first<{ found: number }>();
    if (!row) return missing();
    const config = await resolvePublishedForm(db, formId);
    return json({ config }, 200);
  } catch { return json({ error: 'Form configuration is unavailable.' }, 503); }
}
