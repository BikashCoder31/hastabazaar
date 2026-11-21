import type { CustomerActor } from '@/components/storefront/customer-acting-chip';
import type { ComplaintRow } from '@/lib/db/repositories/complaints';
import type { ReturnCaseRow } from '@/lib/db/repositories/returns';
import type { CustomerRequestEvent, CustomerRequestKind } from '@/lib/returns/customer-aftercare-context';

export const aftercareBox = 'min-w-0 rounded-2xl border border-[#E4DACA] bg-[#FDFAF5] p-5 sm:p-6';
export const aftercarePrimary = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-[#14213D] px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#233652] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-60';
export const aftercareSecondary = 'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-[#CFBB9E] px-4 py-2.5 text-center text-sm font-semibold text-[#14213D] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-60';
export const aftercareLink = 'inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold text-[#A8232E] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';

export type CustomerRequestRecord = { kind: 'return'; row: ReturnCaseRow } | { kind: 'complaint'; row: ComplaintRow };

const money = new Intl.NumberFormat('en-NP', { currency: 'NPR', style: 'currency' });
const localDate = new Intl.DateTimeFormat('en-NP', { timeZone: 'Asia/Kathmandu', weekday: 'short', day: 'numeric', month: 'short' });
const localTime = new Intl.DateTimeFormat('en-NP', { timeZone: 'Asia/Kathmandu', dateStyle: 'medium', timeStyle: 'short' });
export const aftercareMoney = (paisa: number) => money.format(paisa / 100);
export const shortAftercareDate = (date: number) => localDate.format(date);
export const longAftercareDate = (date: number) => localTime.format(date);

const readableReasons: Record<string, string> = {
  damaged: 'Damaged or faulty', defective: 'Damaged or faulty', wrong_item: 'Wrong item',
  not_as_described: 'Not as described', counterfeit: 'Possibly not genuine', late_delivery: 'Arrived very late',
  change_of_mind: 'Changed my mind', other: 'Something else', product: 'Product', delivery: 'Delivery',
  seller: 'Seller', refund: 'Refund', service: 'Hastabazaar service', safety: 'Safety or urgent concern',
};
export const customerRequestReason = (value: string) => readableReasons[value] ?? value.replaceAll('_', ' ');

export function customerCaseHref(kind: CustomerRequestKind, id: string) {
  return `/account/refunds?${new URLSearchParams({ case: id, kind })}`;
}

export interface CustomerRequestProgress {
  actor: CustomerActor;
  step: 0 | 1 | 2 | 3 | 4;
  title: string;
  description: string;
  finished?: boolean;
}

export function customerRequestProgress({ kind, status, waitingFor, sellerName, phase, outcome, refundStatus, replacementStatus }: {
  kind: CustomerRequestKind; status: string; waitingFor?: string | null; sellerName?: string | null;
  phase?: string | null; outcome?: string | null; refundStatus?: string | null; replacementStatus?: string | null;
}): CustomerRequestProgress {
  if (refundStatus === 'payment_details_needed') return { actor: 'you', step: 4, title: 'Add your refund details', description: 'Provide your bank details privately so we can verify where to send the approved refund.' };
  if (refundStatus === 'confirmed_settled' || refundStatus === 'retry_completed' || refundStatus === 'paid') {
    return { actor: 'done', step: 4, title: 'Refund sent', description: 'Your current refund payment is confirmed.', finished: true };
  }
  if (refundStatus === 'corrected') return { actor: 'done', step: 4, title: 'Refund decision updated', description: 'See the latest refund decision below.', finished: true };
  if (refundStatus && refundStatus !== 'approved' && refundStatus !== 'pending_high_value_approval')
    return { actor: 'hastabazaar', step: 4, title: 'Hastabazaar is handling your refund', description: 'See the latest payment update below.' };
  if (status === 'rejected') return { actor: 'done', step: 2, title: 'Request declined', description: 'You can read the decision below.', finished: true };
  if (status === 'closed' || status === 'resolved') return outcome === 'replacement'
    ? { actor: 'done', step: 4, title: 'Replacement completed', description: 'You can read the recorded outcome below.', finished: true }
    : { actor: 'done', step: 2, title: 'Request closed', description: 'You can read the recorded outcome below.', finished: true };
  if (waitingFor === 'customer' || status === 'needs_customer_changes' || status === 'waiting_customer') {
    return { actor: 'you', step: 2, title: 'Hastabazaar needs your reply', description: 'Reply below so we can decide. Your request stays open while we wait.' };
  }
  if (waitingFor === 'seller' || (kind === 'return' && status === 'requested')) return {
    actor: 'seller', step: 1, title: sellerName ? `${sellerName} is replying` : 'Waiting for the seller to reply',
    description: 'The seller can accept, explain, or ask for more information.' };
  if (outcome === 'replacement' && replacementStatus === 'reserved') return { actor: 'hastabazaar', step: 4,
    title: 'Replacement being prepared', description: 'See the recorded delivery date below.' };
  if (outcome === 'replacement' && replacementStatus === 'dispatched') return { actor: 'courier', step: 4,
    title: 'Replacement with the courier', description: 'See the recorded delivery details below.' };
  if (outcome === 'replacement' && replacementStatus === 'delivered') return { actor: 'hastabazaar', step: 4,
    title: 'Replacement delivered', description: 'The delivery is recorded. We’re completing your request.' };
  if (kind === 'return' && (phase === 'received' || phase === 'inspected' || status === 'received' || status === 'inspected')) {
    return { actor: 'hastabazaar', step: 3, title: 'Hastabazaar is checking the item', description: 'We’ve received the returned item. See the handling details below.' };
  }
  if (waitingFor === 'carrier' || status === 'in_transit' || phase === 'in_transit') return {
    actor: 'courier', step: 3, title: kind === 'return' ? 'With the courier' : 'Waiting for a courier update',
    description: kind === 'return' ? 'See the recorded return instructions and arrangements below.' : 'Hastabazaar is following up with the courier.' };
  if (refundStatus) return { actor: 'hastabazaar', step: 4, title: 'Hastabazaar is handling your refund', description: 'See the latest payment update below.' };
  if (kind === 'return' && status === 'approved') return { actor: 'hastabazaar', step: 3, title: 'Return approved', description: 'See the instructions below for what happens next.' };
  return { actor: 'hastabazaar', step: status === 'open' || status === 'new' ? 0 : 2,
    title: 'Hastabazaar is reviewing your request', description: 'We’ll post the next recorded update here.' };
}

export function requestProgressForRecord(record: CustomerRequestRecord) {
  const shared = { kind: record.kind, status: record.row.status, waitingFor: record.row.followup?.waitingFor, sellerName: record.row.sellerName };
  if (record.kind === 'complaint') return customerRequestProgress(shared);
  const { row } = record;
  const nativeStatus = row.refundProgress?.status ?? row.refundPaymentProgress?.status ?? row.refundStatus;
  return customerRequestProgress({ ...shared, phase: row.physical?.phase, outcome: row.resolutionOutcome,
    refundStatus: nativeStatus, replacementStatus: row.physical?.shipments.at(-1)?.state });
}

interface TimelineLine {
  id: string;
  author: string;
  style: 'seller' | 'shopper' | 'staff';
  message: string;
  createdAt: number;
}

export function customerRequestTimeline(record: CustomerRequestRecord, events: readonly CustomerRequestEvent[]): TimelineLine[] {
  const row = record.row;
  const ownReplyLabel = record.kind === 'return' ? '\n\nCustomer clarification: ' : '\n\nCustomer reply: ';
  const ownReplyAction = record.kind === 'return' ? 'customer_clarified' : 'customer_replied';
  const ownEvents = events.filter(event => event.action === ownReplyAction && event.actorType === 'customer').toSorted((left,right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  const originals = ownEvents.length ? row.detail.split(ownReplyLabel) : [row.detail];
  const separated = originals.length === ownEvents.length + 1;
  const original = separated ? originals[0] : row.detail;
  const replyText = new Map(separated ? ownEvents.map((event,index) => [event.id,originals[index + 1]]) : []);
  const lines: TimelineLine[] = [{ id: `${row.id}:created`, author: 'You', style: 'shopper',
    message: original, createdAt: record.kind === 'return' ? record.row.requestedAt : record.row.createdAt }];
  let sellerRecorded = false;
  for (const event of events) {
    if (['customer_requested', 'customer_created', 'customer_opened', 'support_recorded'].includes(event.action) && event.action !== ownReplyAction) continue;
    const seller = event.actorType === 'seller';
    const shopper = event.actorType === 'customer';
    const response = seller && event.action === 'seller_responded' ? row.sellerResponse : null;
    if (response) sellerRecorded = true;
    const message = response ?? replyText.get(event.id) ?? event.message;
    if (!message?.trim()) continue;
    lines.push({ id: event.id, author: shopper ? 'You' : seller ? row.sellerName ?? 'Seller' : 'Hastabazaar',
      style: shopper ? 'shopper' : seller ? 'seller' : 'staff', message, createdAt: event.createdAt });
  }
  if (!sellerRecorded && row.sellerResponse) lines.push({ id: `${row.id}:seller`, author: row.sellerName ?? 'Seller', style: 'seller', message: row.sellerResponse, createdAt: row.updatedAt });
  if (record.kind === 'complaint' && record.row.resolution && !lines.some(line => line.message === record.row.resolution)) lines.push({
    id: `${row.id}:resolution`, author: 'Hastabazaar', style: 'staff', message: record.row.resolution, createdAt: record.row.resolvedAt ?? row.updatedAt,
  });
  return lines.toSorted((left,right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));
}
