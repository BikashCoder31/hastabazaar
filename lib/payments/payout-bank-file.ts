import { checkoutCommitClock } from '../checkout/commit-policy-guards';
import { parseBankDetails, SellerBankError, type BankDetails } from '../sellers/bank-details';
import { noProtectedHoldSql, verifiedIdentityAtCommitSql } from '../sellers/protected-change-policy';
import { sellerPayoutFixOpenSql } from '../sellers/payout-fixes';
import { SecurityRequestError } from '../security/request';
import type { PayoutBankFileActor } from './payout-bank-file-access';
import { payoutRunRequestGroupLength, payoutRunRequestLength, payoutRunRequestPrefix } from './payout-bank-file-scope';

type PayoutBankFileSource = {
  id: string;
  reference: string;
  seller: string;
  amountPaisa: number;
  beneficiaryVersionId: string | null;
  details: string | null;
};

export type PayoutBankFileOverview = {
  runId: string;
  count: number;
  totalPaisa: number;
  blocked: { id: string; reference: string; seller: string }[];
};

function payoutBankFileSourcesSql(db: D1Database) {
  const clock = checkoutCommitClock(db);
  // Keep rows without a verified destination for the exclusion list. The immutable
  // beneficiary must still be the payout destination and the seller's verified account.
  return `SELECT p.id, p.payout_number AS reference, s.legal_name AS seller, p.amount_paisa AS amountPaisa,
    b.id AS beneficiaryVersionId,
    CASE WHEN s.status='approved' AND d.status='verified' AND ${verifiedIdentityAtCommitSql(db, 's.id')}
      AND ${noProtectedHoldSql('s.id', 'payouts')}
      AND NOT (${sellerPayoutFixOpenSql('s.id')})
      AND NOT EXISTS(SELECT 1 FROM seller_payout_review_blocks block WHERE block.payout_model='registered' AND block.payout_id=p.id)
      THEN b.details_json END AS details
    FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id
    JOIN payout_events e ON e.payout_id=p.id AND e.request_id=p.operation_request_id AND e.actor_id=p.approved_by
    LEFT JOIN seller_protected_revisions v ON v.seller_id=s.id
    LEFT JOIN seller_beneficiary_versions b ON b.seller_id=s.id AND b.id=substr(p.destination_reference,13)
      AND substr(p.destination_reference,1,12)='BENEFICIARY:' AND HEX(s.payout_account_reference)=HEX(p.destination_reference)
      AND b.identity_revision=v.identity_revision AND b.verified_by IS NOT NULL AND b.verified_by<>s.user_id
    LEFT JOIN seller_documents d ON d.id=b.document_id AND d.seller_id=s.id AND d.kind='bank_verification'
      AND (d.valid_until IS NULL OR d.valid_until>${clock})
    WHERE s.user_id<>? AND e.action='approve' AND e.to_status='approved' AND e.actor_type='super_admin'
      AND length(e.request_id)=${payoutRunRequestLength} AND HEX(substr(e.request_id,1,${payoutRunRequestGroupLength + 1}))=HEX(?)
      AND p.status='approved' AND p.paid_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets t WHERE t.registered_payout_id=p.id AND t.state IN ('processing','uncertain','paid'))`;
}

function payoutBankFileSourceBindings(actorId: string, runId: string) {
  return [actorId, `${payoutRunRequestPrefix}${runId}-`];
}

function verifiedDetails(source: PayoutBankFileSource): BankDetails | null {
  if (!source.beneficiaryVersionId || !source.details) return null;
  try {
    const value = JSON.parse(source.details);
    return value && typeof value === 'object' && !Array.isArray(value) ? parseBankDetails(value) : null;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof SellerBankError) return null;
    throw error;
  }
}

async function readPayoutBankFileSelection(db: D1Database, actorId: string, runId: string) {
  const { results } = await db.prepare(payoutBankFileSourcesSql(db) + ' ORDER BY e.created_at, p.payout_number, p.id')
    .bind(...payoutBankFileSourceBindings(actorId, runId)).all<PayoutBankFileSource>();
  const payable = [];
  const blocked: PayoutBankFileOverview['blocked'] = [];
  for (const source of results) {
    const { id, reference, seller, amountPaisa } = source;
    const details = verifiedDetails(source);
    if (details && amountPaisa > 0 && Number.isSafeInteger(amountPaisa)) payable.push({ source, details });
    else blocked.push({ id, reference, seller });
  }
  const totalPaisa = payable.reduce((sum, { source }) => sum + source.amountPaisa, 0);
  if (!Number.isSafeInteger(totalPaisa)) throw new Error('Payout file total is outside the supported range.');
  return { payable, blocked, totalPaisa, candidateCount: results.length };
}

export async function readPayoutBankFileOverview(db: D1Database, actorId: string, runId: string): Promise<PayoutBankFileOverview> {
  const { payable, blocked, totalPaisa } = await readPayoutBankFileSelection(db, actorId, runId);
  return { runId, count: payable.length, totalPaisa, blocked };
}

function csvCell(text: string) {
  const safeText = /^[=+@-]/.test(text.trimStart()) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safeText.replaceAll('"', '""') + '"';
}

function expectedRowsSql(db: D1Database) {
  if ((db as D1Database & { dialect?: string }).dialect === 'mariadb') {
    return `JSON_TABLE(?, '$[*]' COLUMNS(id VARCHAR(191) PATH '$[0]', reference VARCHAR(191) PATH '$[1]',
      seller TEXT PATH '$[2]', amountPaisa BIGINT PATH '$[3]', beneficiaryVersionId VARCHAR(191) PATH '$[4]')) AS expected`;
  }
  return `(SELECT json_extract(entry.value,'$[0]') AS id, json_extract(entry.value,'$[1]') AS reference,
    json_extract(entry.value,'$[2]') AS seller, json_extract(entry.value,'$[3]') AS amountPaisa,
    json_extract(entry.value,'$[4]') AS beneficiaryVersionId FROM json_each(?) entry) AS expected`;
}

export async function createPayoutBankFile(db: D1Database, access: PayoutBankFileActor, runId: string) {
  const { actor, session } = access;
  const { payable, totalPaisa, candidateCount } = await readPayoutBankFileSelection(db, actor.id, runId);
  if (!payable.length) throw new SecurityRequestError('No approved, unpaid payouts with verified bank details are left in this run.', 409, 'BANK_FILE_EMPTY');

  const rows = [['Payout number', 'Seller legal name', 'Bank name', 'Branch', 'Account holder name', 'Account number', 'Amount (NPR)', 'Payment reference']];
  for (const { source, details } of payable) {
    const npr = `${Math.trunc(source.amountPaisa / 100)}.${String(source.amountPaisa % 100).padStart(2, '0')}`;
    rows.push([source.reference, source.seller, details.bankName, details.bankBranch,
      details.payoutBeneficiary, details.bankAccountNumber, npr, source.reference]);
  }
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const expected = JSON.stringify(payable.map(({ source }) => [source.id, source.reference, source.seller, source.amountPaisa, source.beneficiaryVersionId]));
  const clock = checkoutCommitClock(db);
  const sessionSql = session ? `AND EXISTS(SELECT 1 FROM user_sessions current_session WHERE current_session.token_hash=? AND current_session.user_id=u.id
        AND current_session.expires_at>${clock}) AND ${clock} BETWEEN ? AND ?
      AND EXISTS(SELECT 1 FROM marketplace_settings WHERE \`key\`=? AND HEX(value)=HEX(?))
      AND EXISTS(SELECT 1 FROM marketplace_settings WHERE \`key\`=? AND HEX(value)=HEX(?))` : '';
  const auditRows = JSON.stringify({ payoutIds: payable.map(({ source }) => source.id), totalPaisa, currency: 'NPR' });

  // Audit and check the exact sources together. A payout, destination or session
  // that changes while the export is being built must never release stale CSV bytes.
  const result = await db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
    SELECT ?,u.id,'payout.bank_file.downloaded','payout_run',?,'Download approved payouts for bank transfer.',?,${clock}
    FROM users u JOIN user_roles staff_role ON staff_role.user_id=u.id
    WHERE HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND HEX(u.status)=HEX('active') AND HEX(staff_role.role)=HEX('super_admin') ${sessionSql}
      AND EXISTS(SELECT COUNT(*) FROM (${payoutBankFileSourcesSql(db)}) actual
        LEFT JOIN ${expectedRowsSql(db)} ON HEX(expected.id)=HEX(actual.id) AND HEX(expected.reference)=HEX(actual.reference)
          AND HEX(expected.seller)=HEX(actual.seller) AND expected.amountPaisa=actual.amountPaisa
          AND HEX(expected.beneficiaryVersionId)=HEX(actual.beneficiaryVersionId) AND actual.details IS NOT NULL
        HAVING COUNT(*)=? AND COUNT(expected.id)=?)`)
    .bind(crypto.randomUUID(), runId, auditRows, actor.id, actor.authSubject,
      ...(session ? [session.hash, session.verifiedAt, session.expiresAt, session.account.key, session.account.raw,
        session.proof.key, session.proof.raw] : []),
      ...payoutBankFileSourceBindings(actor.id, runId), expected, candidateCount, payable.length).run();
  if (Number(result.meta.changes) !== 1)
    throw new SecurityRequestError('The payout run or your sign-in changed. Refresh and try again.', 409, 'BANK_FILE_CHANGED');
  return csv;
}
