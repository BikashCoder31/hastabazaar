import { CURRENT_CUSTOMER_ROLE_SQL } from '@/lib/auth/customer-scope';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { customerCodSchemaAvailable } from '@/lib/orders/first-cod-review';
import { commandReceipt } from '@/lib/workflows/contracts';

export class CustomerCodConfirmationError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export async function setCustomerCodConfirmation(db: D1Database, input: {
  actorId: string;
  actorSubject: string;
  customerId: string;
  enabled: boolean;
  reason: string;
  requestId: string;
  now: number;
}) {
  const { actorId, actorSubject, customerId, enabled, requestId, now } = input;
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 300)
    throw new CustomerCodConfirmationError('Give a reason of 8–300 characters.', 400);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))
    throw new CustomerCodConfirmationError('A request reference is required.', 400);

  const authority = await staffMutationGuard(db, actorId, 'audit_log.view', CustomerCodConfirmationError);
  if (authority.role !== 'super_admin')
    throw new CustomerCodConfirmationError('Super Admin access is required.', 403);
  if (!await customerCodSchemaAvailable(db))
    throw new CustomerCodConfirmationError('Call to confirm is unavailable.', 404);

  const customerScope = `id=? AND HEX(id)=HEX(?) AND status<>'deleted' AND ${CURRENT_CUSTOMER_ROLE_SQL}`;
  const customer = await db.prepare(`SELECT id FROM users WHERE ${customerScope}`)
    .bind(customerId, customerId).first();
  if (!customer) throw new CustomerCodConfirmationError('Customer not found.', 404);

  const source = { action: 'customer.cod_confirmation.changed', subjectType: 'customer', subjectId: customerId, auditReason: reason };
  const context = { actorId, requestId, now, expectedRevision: null };
  const readReceipt = async () => {
    try { return await commandReceipt(db, context, source, { enabled, reason, actorSubject }); }
    catch (error) {
      if (error instanceof Error && error.message === 'Request reference was already used for different command content.')
        throw new CustomerCodConfirmationError('This request has already been used. Refresh Customers.');
      throw error;
    }
  };
  const receipt = await readReceipt();
  if (receipt.replayed) return;
  const guard = crypto.randomUUID();
  try {
    await db.batch([
      ...authority.statements,
      db.prepare(`UPDATE users SET cod_confirmation_required=?,updated_at=?
        WHERE ${customerScope} AND cod_confirmation_required=?`)
        .bind(Number(enabled), now, customerId, customerId, Number(!enabled)),
      db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN changes()=1 AND EXISTS(
        SELECT 1 FROM users WHERE id=? AND HEX(id)=HEX(?) AND HEX(auth_subject)=HEX(?)
      ) THEN 1 ELSE 0 END`).bind(guard, actorId, actorId, actorSubject),
      receipt.insert({ previous: !enabled, enabled }),
      db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
    ]);
  } catch (error) {
    if ((await readReceipt()).replayed) return;
    if (error instanceof Error && /transaction_guards|staff_permission_guards/i.test(error.message))
      throw new CustomerCodConfirmationError('This setting or your access changed. Refresh Customers.');
    throw error;
  }
}
