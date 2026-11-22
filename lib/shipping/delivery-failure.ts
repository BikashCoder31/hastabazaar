export const deliveryFailureReasons = [
  ['refused', 'Customer refused the parcel'],
  ['not_reached', 'Customer could not be reached'],
  ['wrong_address', 'Wrong or incomplete address'],
  ['courier_problem', 'Courier problem'],
  ['other', 'Other (note required)'],
] as const;

export type DeliveryFailureReason = (typeof deliveryFailureReasons)[number][0];

export function readDeliveryFailureReason(value: unknown): DeliveryFailureReason | undefined {
  return deliveryFailureReasons.find(([reason]) => reason === value)?.[0];
}

export function deliveryFailureReasonLabel(reason: DeliveryFailureReason | null) {
  if (reason === 'other') return 'Other';
  return deliveryFailureReasons.find(([value]) => value === reason)?.[1] ?? 'Reason not recorded';
}

export async function deliveryFailureSchemaAvailable(db: D1Database) {
  if ((db as D1Database & { dialect?: string }).dialect === 'mariadb') {
    return Boolean(await db.prepare(`SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
      AND TABLE_NAME='shipping_jobs' AND COLUMN_NAME='delivery_failure_reason'`).first());
  }
  const { results } = await db.prepare('PRAGMA table_info(shipping_jobs)').all<{ name: string }>();
  return results.some(column => column.name === 'delivery_failure_reason');
}
