import Link from 'next/link';
import { NextStepBox } from '@/components/ui/next-step-box';
import type { StepLineStep } from '@/components/ui/step-line';
import type { WhoseTurnStatus } from '@/components/ui/whose-turn';
import type { getRefundFinanceWorkspace, RefundPacketSummary } from '@/lib/payments/refund-workspace';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { RefundDetailHeading, RefundDetails, RefundReviewButton } from './refund-recovery-layout';

type Workspace = Awaited<ReturnType<typeof getRefundFinanceWorkspace>>;
type Obligation = Workspace['obligations'][number];
type Destination = Workspace['destinations'][number];

const reasons: Record<string, string> = {
  return_refund: 'Approved return',
  cancellation: 'Approved cancellation refund',
  service_fee: 'Authorized service fee refund',
  receipt_return: 'Return of an unused payment',
};

export const refundMoney = (paisa: number) => new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(paisa / 100);
export const refundDate = (epoch: number) => new Date(epoch).toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' });

export function refundReason(kind: string) {
  return reasons[kind] ?? 'Authorized refund';
}

export function refundStatus(row: Obligation, packet?: RefundPacketSummary): { status: WhoseTurnStatus; label: string } {
  if (row.state === 'completed') return { status: 'done' as const, label: 'Confirmed' };
  if (row.state === 'uncertain') return { status: 'with-hastabazaar' as const, label: 'Bank outcome uncertain' };
  if (row.state === 'processing') return { status: 'with-hastabazaar' as const, label: packet?.privateReview?.submission ? 'Bank confirming' : 'In progress' };
  if (row.state === 'blocked') return { status: 'with-hastabazaar' as const, label: 'Funding review' };
  return { status: 'with-hastabazaar' as const, label: 'Approved' };
}

export function refundDestination(row: Obligation, destination?: Destination) {
  const wallet = row.walletPaisa > 0 ? 'Hastabazaar wallet' : null;
  const cash = row.cashPaisa > 0 ? destination?.status === 'verified' ? destination.label
    : destination?.status === 'submitted' ? `${destination.label} (verification pending)` : 'Bank destination needed' : null;
  const bankReturn = row.bankSatisfiedPaisa > 0 ? 'Original payer (returned by the bank)' : null;
  return [wallet, cash, bankReturn].filter(Boolean).join(' and ') || 'See the original refund record';
}

export function RefundReviewSummary({ row, destinations, live, funding, canOpenOrder, superAdmin, canManageRefunds = true, currentHref }: {
  row: Obligation;
  destinations: Destination[];
  live?: RefundPacketSummary;
  funding: Workspace['funding'];
  canOpenOrder: boolean;
  superAdmin: boolean;
  canManageRefunds?: boolean;
  currentHref: string;
}) {
  const destination = destinations.find(item => item.current);
  const retainedDestination = destinations.find(item => item.id === live?.destinationVersionId);
  const acknowledgedAt = live?.privateReview?.submission?.acknowledgedAt;
  const completed = row.state === 'completed';
  const sent = completed || acknowledgedAt !== undefined;
  const steps: StepLineStep[] = [
    { id: 'approved', label: 'Approved', state: 'complete', detail: refundDate(row.authorizedAt) },
    { id: 'sent', label: 'Sent', state: sent ? 'complete' : 'current', detail: acknowledgedAt === undefined ? undefined : refundDate(acknowledgedAt) },
    { id: 'confirmed', label: 'Confirmed', state: completed ? 'complete' : sent ? 'current' : 'upcoming' },
    { id: 'update', label: 'Customer update', state: completed ? 'complete' : 'upcoming', detail: completed ? 'Available in refund details' : undefined },
  ];
  const amount = refundMoney(row.originalCashPaisa + row.walletPaisa);
  let status = refundStatus(row, live);
  let next = 'Review the original records and current refund status below.';
  let action: { label: string; id: string } | undefined;

  if (completed) {
    next = 'The original refund is recorded as complete. See the payment and any later bank return below.';
  } else if (!canManageRefunds) {
    next = 'This refund is waiting for Finance to confirm the next step.';
  } else if (live && ['processing', 'uncertain'].includes(live.state)) {
    next = live.state === 'uncertain'
      ? 'Reconcile this attempt with the bank before considering another payment.'
      : live.amountPaisa ? 'Record the bank’s acknowledgment or confirm the actual completed transfer.' : 'Confirm the original wallet credit has been restored.';
    if (live.privateReview) {
      action = live.amountPaisa && !live.privateReview.submission && live.state === 'processing'
        ? { label: 'Review bank acknowledgment', id: `refund-action-${live.id}-submission` }
        : { label: live.state === 'uncertain' ? 'Review uncertain bank outcome' : live.amountPaisa ? 'Confirm completed transfer' : 'Confirm wallet credit restoration', id: `refund-action-${live.id}-${live.state === 'uncertain' ? 'outcomes' : 'paid'}` };
    }
  } else if (row.state === 'blocked') {
    next = 'Review available company funds and the retained refund packet before proceeding.';
    action = { label: 'Review company funds', id: 'refund-company-funding' };
  } else if (row.independentReviewer && superAdmin && live?.state === 'prepared') {
    next = 'Review the exact amount and the retained payment source.';
    action = { label: 'Review refund for approval', id: `refund-action-${live.id}-approve` };
  } else if (row.independentReviewer && superAdmin && live?.state === 'approved') {
    next = live.amountPaisa ? 'Open the authorized instruction before sending the transfer through the bank.' : 'Open the approved instruction to begin restoring the original wallet credit.';
    action = { label: live.amountPaisa ? 'Begin refund instruction' : 'Begin wallet credit restoration', id: `refund-action-${live.id}-start` };
  } else if (!live && row.state === 'open' && row.independentReviewer) {
    if (row.cashPaisa > 0 && destination?.status === 'submitted') {
      next = 'Verify that the submitted bank details belong to the authorized recipient.';
      if (superAdmin) action = { label: 'Review submitted bank details', id: `refund-action-${destination.id}-verify` };
    } else if (row.cashPaisa > 0 && destination?.status !== 'verified') {
      next = 'Wait for the customer to provide current bank details before preparing a transfer.';
    } else if (row.cashPaisa > 0 && !funding.some(account => account.statementId && account.availablePaisa !== null)) {
      next = 'Review a current company funding statement before preparing the transfer.';
      action = { label: 'Review company funds', id: 'refund-company-funding' };
    } else {
      next = row.cashPaisa ? 'Review the verified destination and company funding for the exact refund.' : 'Prepare the restoration of the wallet credit recorded on the original payment.';
      action = { label: row.cashPaisa ? 'Prepare refund for review' : 'Prepare wallet credit restoration', id: `refund-action-${row.id}-prepare` };
    }
  }
  if (action && action.id !== 'refund-company-funding') status = { status: 'your-turn', label: 'Review needed' };

  return <>
    <RefundDetailHeading reference={row.orderNumber ?? row.id}
      title={`${amount} back to ${row.customerName}`} status={status} steps={steps} progressLabel="Refund progress" />
    <RefundDetails rows={[
      { label: 'Why', value: refundReason(row.sourceKind) },
      { label: 'Goes to', value: refundDestination(row, retainedDestination ?? destination) },
      { label: 'Amount', value: amount },
    ]} />
    <NextStepBox>{next}</NextStepBox>
    <div className="flex flex-wrap gap-2">
      {action ? <RefundReviewButton targetId={action.id}>{action.label}</RefundReviewButton> : null}
      {canOpenOrder && row.orderId ? <Link href={withAdminReturnTo(`/admin/orders/${encodeURIComponent(row.orderId)}`, currentHref)}
        className="inline-flex min-h-11 items-center rounded-[10px] border border-[#D3C5AD] px-4 py-2.5 text-sm font-semibold text-[#14213D] hover:bg-[#F7F3EC]">
        Open order {row.orderNumber}
      </Link> : null}
    </div>
  </>;
}
