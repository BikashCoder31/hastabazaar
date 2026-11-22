import {
  preserveOriginalCommissionContinuity,
  type ContinuityRequest,
} from '../db/repositories/commission-continuity';
import {
  CONTINUITY_CAPTURE,
  CONTINUITY_SOURCE,
  CONTINUITY_SOURCE_RELEASE,
} from '../db/repositories/commission-continuity-proof';

/** No CLI/public route. A separately reviewed maintenance adapter supplies native bindings. */
export async function runReviewedCommissionContinuity(
  db: D1Database,
  request: ContinuityRequest,
  identity: {
    runtime: 'production' | 'isolated_rehearsal';
    origin: string;
    reviewedSelectionSha256: string;
    capturePackageSha256: string;
    rehearsalDatabase?: string;
  },
) {
  if (
    request.mode !== 'reviewed_native' ||
    (db as D1Database & { dialect?: string }).dialect !== 'mariadb' ||
    identity.origin !== 'https://hastabazaar.com' ||
    !['production', 'isolated_rehearsal'].includes(identity.runtime) ||
    request.sourceRelease !== CONTINUITY_SOURCE_RELEASE ||
    request.sourceCommit !== CONTINUITY_SOURCE ||
    request.captureSha256 !== CONTINUITY_CAPTURE ||
    identity.capturePackageSha256 !==
      'f57505b5d110c3d9cb53d4070c35e351d5eb5b1c66782ba34e31c5d58a953580' ||
    !/^[a-f0-9]{64}$/.test(identity.reviewedSelectionSha256) ||
    request.selectionSha256 !== identity.reviewedSelectionSha256
  )
    throw new Error(
      'Reviewed continuity environment/source binding is required.',
    );
  const native = await db
    .prepare('SELECT DATABASE() AS databaseName,CURRENT_USER() AS account')
    .first<{ databaseName: string; account: string }>();
  const production = identity.runtime === 'production';
  if (
    !native ||
    (production
      ? native.databaseName !== 'hastabaz_marketplace' ||
        native.account !== 'hastabaz_marketapp@localhost'
      : !identity.rehearsalDatabase ||
        identity.rehearsalDatabase === 'hastabaz_marketplace' ||
        native.databaseName !== identity.rehearsalDatabase)
  )
    throw new Error(
      'Native continuity database identity does not match the reviewed target.',
    );
  const prior = await db
    .prepare('SELECT id FROM commission_continuity_operations WHERE id=?')
    .bind(request.requestId)
    .first();
  if (!prior && Math.abs(Date.now() - request.now) > 5000)
    throw new Error('Continuity requires the actual operation clock.');
  return preserveOriginalCommissionContinuity(db, request);
}
