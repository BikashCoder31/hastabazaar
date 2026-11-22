/** The same current customer role required by the read-only account API resolver. */
export const CURRENT_CUSTOMER_ROLE_SQL = `EXISTS (
  SELECT 1 FROM user_roles customer_authority
  WHERE customer_authority.user_id=users.id
    AND HEX(customer_authority.user_id)=HEX(users.id)
    AND customer_authority.role='customer'
    AND HEX(customer_authority.role)=HEX('customer')
)`;

export class CustomerScopeError extends Error {
  readonly status=403;
  constructor(){super('Current account access changed. Reopen your account before continuing.');}
}

/** Classify a rejected native batch without turning an unrelated failure into an access denial. */
export async function assertCurrentCustomerScope(database:D1Database,actorId:string):Promise<void> {
  const row=await database.prepare(`SELECT id FROM users WHERE id=? AND status='active'
    AND HEX(status)=HEX('active') AND ${CURRENT_CUSTOMER_ROLE_SQL}`)
    .bind(actorId).first<{id:string}>();
  if(!row||row.id!==actorId)throw new CustomerScopeError();
}
