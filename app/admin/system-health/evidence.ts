import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { formHealthRuntimeScope } from '@/lib/operations/form-health';
import { readEmailHealthRuntimeConfig } from '@/lib/operations/email-delivery-overview';
import { readSystemHealthWorkspace } from '@/lib/operations/system-health-workspace';
import type { SecurityPolicyBindings } from '@/lib/security/runtime-policy';

type BackupVerification = { scope: string; status: string; verifiedAt: number };

export type BackupEvidence = {
  available: boolean;
  completedAt: number | null;
  verification: BackupVerification | null;
};

export type ClosedIncident = { id: string; title: string; resolvedAt: number };

export function healthRequestContext() {
  const bindings = env as unknown as SecurityPolicyBindings & Record<string, string | undefined> & { DB?: D1Database };
  const db = requireDatabase(bindings);
  const scope = formHealthRuntimeScope(bindings);
  const email = readEmailHealthRuntimeConfig({ ...bindings, NODE_ENV: process.env.NODE_ENV }, scope.now);
  const raw = bindings.SYSTEM_HEALTH_EXPECTED_SINCE;
  const expected = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return {
    bindings,
    db,
    scope: {
      ...scope,
      expectedSince: email.expectedSince,
      systemExpectedSince: Number.isSafeInteger(expected) && expected > 0 && expected <= scope.now ? expected : null,
    },
  };
}

export async function readHealthPageEvidence(actorId: string, mayViewBackups: boolean) {
  const { db, scope } = healthRequestContext();
  const [overview, backup, lastClosed] = await Promise.all([
    readSystemHealthWorkspace(db, actorId, scope),
    mayViewBackups ? readBackupEvidence(db, scope.now) : null,
    scope.environment === 'unknown' ? null : db.prepare(`
      SELECT h.id, COALESCE(g.title, 'Service incident') AS title, h.resolved_at AS resolvedAt
      FROM service_health_incidents h LEFT JOIN service_incident_governance g ON g.incident_id = h.id
      WHERE h.environment = ? AND h.state = 'resolved' AND h.resolved_at <= ?
      ORDER BY h.resolved_at DESC, h.id DESC LIMIT 1
    `).bind(scope.environment, scope.now).first<ClosedIncident>(),
  ]);
  return { overview, backup, lastClosed };
}

async function readBackupEvidence(db: D1Database, now: number): Promise<BackupEvidence> {
  try {
    const native = (db as D1Database & { dialect?: string }).dialect === 'mariadb';
    const [exportRecord, verification] = await Promise.all([
      // Native host backups have no timestamp in the app. Portable exports are preliminary.
      native ? null : db.prepare(`
        SELECT created_at AS completedAt FROM audit_logs
        WHERE subject_type = 'backup' AND action = 'security.backup.completed'
          AND CASE WHEN json_valid(next_json) THEN json_extract(next_json, '$.kind') END = 'data'
          AND created_at <= ?
        ORDER BY created_at DESC, id DESC LIMIT 1
      `).bind(now).first<{ completedAt: number }>(),
      db.prepare(`
        SELECT scope, status, verified_at AS verifiedAt FROM backup_verifications
        WHERE verified_at <= ? ORDER BY verified_at DESC, id DESC LIMIT 1
      `).bind(now).first<BackupVerification>(),
    ]);
    return { available: true, completedAt: exportRecord?.completedAt ?? null, verification };
  } catch {
    return { available: false, completedAt: null, verification: null };
  }
}
