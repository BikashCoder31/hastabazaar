import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getLocalTestIdentity } from '@/lib/auth/local-test-access';
import { hostedSessionHash, readHostedSession } from '@/lib/auth/hosted-session';
import { legacyStaffSetupAllowed,staffSessionIsVerified } from '@/lib/security/session';
import {readSecurityInitialization,type SecurityPolicyBindings} from '@/lib/security/runtime-policy';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import { getStaffPermissionProfile } from '@/lib/db/repositories/staff-permissions';
import { LegalDraftAccessError, type LegalDraftActor } from './model';

async function existingLegalIdentity() {
  const requestHeaders = await headers();
  const bindings=env as unknown as SecurityPolicyBindings & {DB?:D1Database};
  const db = requireDatabase(bindings),now=Date.now();
  const initialized=await readSecurityInitialization(bindings);
  const session=await readHostedSession(db,requestHeaders,now),hash=hostedSessionHash(requestHeaders);
  let subject:string|undefined;
  if(session && !session.isStaff)throw new LegalDraftAccessError('Current authorized staff access is required.');
  if(session?.isStaff && hash && await staffSessionIsVerified(db,session,hash,bindings.HASTABAZAAR_SECURITY_KEY,now,false,initialized))subject=session.userId;
  if(!subject){
    const fixture=getLocalTestIdentity(requestHeaders);
    if(fixture){
      const account=await db.prepare("SELECT id FROM users WHERE auth_subject=? AND status='active'").bind(fixture.userId).first<{id:string}>();
      if(account && await legacyStaffSetupAllowed(db,account.id,bindings.HASTABAZAAR_SECURITY_KEY,initialized))subject=fixture.userId;
    }
  }
  if(!subject)throw new LegalDraftAccessError('Sign in and complete current account security verification.',401);
  return { db, subject };
}

export async function requireLegalDraftApi(): Promise<{ db: D1Database; actor: LegalDraftActor }> {
  const { db, subject } = await existingLegalIdentity();
  // This read-only lookup never accepts invitations, bootstraps staff or changes accounts.
  const row = await db.prepare(`SELECT u.id,u.auth_subject AS authSubject,u.display_name AS displayName
    FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.auth_subject=? AND u.status='active' AND r.role='super_admin' LIMIT 1`)
    .bind(subject).first<LegalDraftActor>();
  if (!row || !can('super_admin', 'legal_content.publish')) throw new LegalDraftAccessError();
  return { db, actor: row };
}

export async function requireLegalProcedureReaderApi() {
  const { db, subject } = await existingLegalIdentity();
  const row = await db.prepare(`SELECT u.id,u.auth_subject AS authSubject,u.display_name AS displayName,r.role
    FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.auth_subject=? AND u.status='active'
    AND r.role IN ('super_admin','admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1`)
    .bind(subject).first<LegalDraftActor & { role: 'admin' | 'super_admin' }>();
  if (!row) throw new LegalDraftAccessError('Current authorized staff access is required.');
  if (row.role === 'admin' && !can({ role: row.role, permissions: (await getStaffPermissionProfile(db, row.id)).permissions }, 'support.manage'))
    throw new LegalDraftAccessError('Current customer-care staff access is required.');
  return { db, actor: row };
}

export async function requireLegalProcedureReaderPage() {
  try { return await requireLegalProcedureReaderApi(); }
  catch (error) {
    if (error instanceof LegalDraftAccessError)
      redirect(error.status === 401 ? '/login?return_to=%2Fadmin%2Flegal-policies%2Factive' : '/staff-access-denied');
    throw error;
  }
}

export async function requireLegalDraftPage() {
  try { return await requireLegalDraftApi(); }
  catch (error) {
    if (error instanceof LegalDraftAccessError)
      redirect(error.status === 401 ? '/login?return_to=%2Fadmin%2Flegal-policies' : '/staff-access-denied');
    throw error;
  }
}
