import { checkoutCommitClock } from '../checkout/commit-policy-guards';
import { commandReceipt } from '../workflows/contracts';
import { responseScopeContains } from './response-sql';

const action = 'order.response.customer.kept';
const subjectType = 'order_response';
const canAnswer = "c.kind='delay' AND c.state<>'resolved' AND c.proposed_ready_at>";
const activeScope = (db: D1Database) => `EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.seller_id=p.seller_id
  AND ${responseScopeContains(db, 'c.scope_json', 'i.id')} AND i.fulfillment_status IN('confirmed','packing','ready_for_pickup'))
  AND NOT EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND i.seller_id=p.seller_id
  AND ${responseScopeContains(db, 'c.scope_json', 'i.id')} AND i.fulfillment_status NOT IN('confirmed','packing','ready_for_pickup'))`;

export type CustomerDelayQuestion = {
  id: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  proposedReadyAt: number;
  createdAt: number;
  revision: number;
  publicMessage: string | null;
  itemIds: string[];
  answered: boolean;
};

type Viewer = { id: string; authSubject: string };
type ReadOptions = { orderId?: string; caseId?: string; includeAnswered?: boolean };

export async function readCustomerDelayQuestions(db: D1Database, viewer: Viewer, options: ReadOptions = {}): Promise<CustomerDelayQuestion[]> {
  const requestId = (db as D1Database & { dialect?: string }).dialect === 'mariadb'
    ? "CONCAT('keep:',c.id,':',c.proposed_ready_at)" : "'keep:'||c.id||':'||c.proposed_ready_at";
  const rows = await db.prepare(`SELECT c.id,o.id AS orderId,o.order_number AS orderNumber,p.seller_id AS sellerId,
    (SELECT MAX(i.seller_name_snapshot) FROM order_items i WHERE i.order_id=o.id AND i.seller_id=p.seller_id) AS sellerName,
    c.proposed_ready_at AS proposedReadyAt,c.created_at AS createdAt,c.revision,c.public_message AS publicMessage,c.scope_json AS scopeJson,
    CASE WHEN EXISTS(SELECT 1 FROM audit_logs a WHERE a.action='${action}' AND a.subject_type='${subjectType}'
      AND a.subject_id=c.id AND a.actor_id=u.id AND a.request_id=${requestId}) THEN 1 ELSE 0 END AS answered
    FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id JOIN orders o ON o.id=p.order_id
    JOIN users u ON u.id=o.customer_id
    WHERE HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND u.status='active'
      AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='customer')
      AND ${canAnswer}${checkoutCommitClock(db)} AND ${activeScope(db)}
      ${options.orderId ? 'AND o.id=?' : ''} ${options.caseId ? 'AND c.id=?' : ''}
    ORDER BY c.created_at DESC,c.id DESC LIMIT 100`)
    .bind(viewer.id, viewer.authSubject, ...(options.orderId ? [options.orderId] : []), ...(options.caseId ? [options.caseId] : []))
    .all<Omit<CustomerDelayQuestion, 'answered' | 'itemIds'> & { answered: number; scopeJson: string }>();
  return rows.results.filter(row => options.includeAnswered || !row.answered).map(({ answered, scopeJson, ...row }) => ({
    ...row, answered: Boolean(answered), itemIds: JSON.parse(scopeJson) as string[],
  }));
}

export class CustomerDelayAnswerError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

/** Record a buyer’s choice without changing the fulfilment or promised delivery date. */
export async function keepCustomerDelayProposal(db: D1Database, viewer: Viewer, input: { caseId: string; proposedReadyAt: number; revision: number }) {
  const checkOwner = () => db.prepare(`SELECT c.id FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id
    JOIN orders o ON o.id=p.order_id JOIN users u ON u.id=o.customer_id
    WHERE c.id=? AND HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND u.status='active'
      AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='customer')`).bind(input.caseId, viewer.id, viewer.authSubject).first();
  const assertOwner = async () => {
    if (!await checkOwner()) throw new CustomerDelayAnswerError('This seller question could not be found.', 404);
  };
  await assertOwner();
  const context = { actorId: viewer.id, requestId: `keep:${input.caseId}:${input.proposedReadyAt}`, expectedRevision: null, now: Date.now() };
  const source = { action, subjectType, subjectId: input.caseId, auditReason: 'The customer chose to keep the order after seeing the seller’s proposed ready date.' };
  const record = () => commandReceipt(db, context, source, { proposedReadyAt: input.proposedReadyAt });
  const result = { kept: true, proposedReadyAt: input.proposedReadyAt };
  const receipt = await record();
  if (receipt.replayed) {
    await assertOwner();
    return result;
  }

  const guard = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
        SELECT 1 FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id
        JOIN orders o ON o.id=p.order_id JOIN users u ON u.id=o.customer_id
        WHERE c.id=? AND HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND u.status='active'
          AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='customer')
          AND c.revision=? AND c.proposed_ready_at=? AND ${canAnswer}${checkoutCommitClock(db)} AND ${activeScope(db)}
      ) THEN 1 ELSE 0 END`).bind(guard, input.caseId, viewer.id, viewer.authSubject, input.revision, input.proposedReadyAt),
      receipt.insert(result),
      db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
    ]);
  } catch (error) {
    await assertOwner();
    if ((await record()).replayed) return result;
    if (/constraint|guard/i.test(String(error))) throw new CustomerDelayAnswerError('The seller’s question changed. Reload the order to review the current date.');
    throw error;
  }
  return result;
}
