import Link from 'next/link';
import { NextStepBox } from '@/components/ui/next-step-box';
import type { StepLineStep } from '@/components/ui/step-line';
import { recoveryMoney } from '@/components/commerce/recovery-action';
import type { RecoveryFinanceWorkspace } from '@/lib/payments/recovery-workspace';
import type { WhoseTurnStatus } from '@/components/ui/whose-turn';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { RefundDetailHeading, RefundDetails, RefundReviewButton } from './refund-recovery-layout';

const labels: Record<string, string> = {
  provisional: 'Checking original records',
  awaiting_approval: 'Ready for review',
  reconciliation: 'Needs reconciliation',
  open: 'Collecting repayment',
  disputed: 'Disputed',
  repayment_plan: 'Repayment plan',
  part_recovered: 'Partly received',
  recovered: 'Recovered',
  closed_no_balance: 'Closed',
  absorbed: 'Covered by Hastabazaar',
};
const closedStates = ['recovered', 'closed_no_balance', 'absorbed'];

export function recoveryStatus(state: string): { status: WhoseTurnStatus; label: string } {
  const label = labels[state] ?? state.replaceAll('_', ' ');
  if (closedStates.includes(state)) return { status: 'done', label };
  if (state === 'awaiting_approval' || state === 'reconciliation') return { status: 'your-turn', label };
  return { status: 'with-hastabazaar', label };
}

export function RecoveryReviewSummary({ item, ready, canApprove, canAllocate, canUseEarnings, canReviewCourier, canReviewClaims, canOpenOrder, currentHref }: {
  item: RecoveryFinanceWorkspace['cases'][number];
  ready: boolean;
  canApprove: boolean;
  canAllocate: boolean;
  canUseEarnings: boolean;
  canReviewCourier: boolean;
  canReviewClaims: boolean;
  canOpenOrder: boolean;
  currentHref: string;
}) {
  const { case: current, position, source } = item.review;
  const order = item.original.order;
  const closed = closedStates.includes(current.state);
  const claimed = item.claims.some(claim => claim.status !== 'not_received');
  const received = position.recoveredPaisa > 0;
  const owed = current.confirmedPaisa > 0;
  const steps: StepLineStep[] = [
    { id: 'owed', label: 'Owed', state: owed ? 'complete' : closed ? 'upcoming' : 'current', detail: owed ? recoveryMoney(current.confirmedPaisa) : undefined },
    { id: 'claim', label: 'Deducted or claimed', state: claimed || received ? 'complete' : owed && !closed ? 'current' : 'upcoming' },
    { id: 'received', label: 'Received', state: received ? position.remainingPaisa > 0 ? 'current' : 'complete' : claimed && !closed ? 'current' : 'upcoming', detail: received ? recoveryMoney(position.recoveredPaisa) : undefined },
    { id: 'closed', label: 'Closed', state: closed ? 'complete' : 'upcoming' },
  ];

  let next = 'Review the original amount, response and recovery records below.';
  let action: { label: string; suffix: string } | undefined;
  if (closed) {
    next = 'The case is closed. The original recovery and its history are available below.';
  } else if (canApprove) {
    next = 'Review the original cost before approving the amount that can be recovered.';
    action = { label: 'Review recovery amount', suffix: 'approve' };
  } else if (!ready) {
    next = current.blocker ?? source.blocker ?? 'Reconcile the original amount and receipts before collection.';
  } else if (canReviewCourier) {
    next = 'Match the verified courier receipt to the original cost before recording reimbursement.';
    action = { label: 'Review courier reimbursement', suffix: 'courier' };
  } else if (canAllocate) {
    next = 'Match the verified repayment to this case and review the amount to allocate.';
    action = { label: 'Review seller repayment', suffix: 'receipt' };
  } else if (canReviewClaims) {
    next = 'Review the seller’s repayment claim and match it to verified incoming money.';
    action = { label: 'Review repayment claims', suffix: 'claims' };
  } else if (canUseEarnings) {
    next = 'The accepted plan authorizes eligible earnings. Review it before applying a deduction.';
    action = { label: 'Review deduction from earnings', suffix: 'earnings' };
  } else if (current.approvedAt !== null && item.followup.contactWork) {
    next = item.followup.contactWork.nextAction;
    action = { label: 'Review seller contact', suffix: 'contact' };
  }

  return <>
    <RefundDetailHeading reference={order?.orderNumber ?? current.id}
      title={position.remainingPaisa > 0 ? `${recoveryMoney(position.remainingPaisa)} to recover from ${item.sellerName}` : `Recovery for ${item.sellerName}`}
      status={recoveryStatus(current.state)} steps={steps} progressLabel="Recovery progress" />
    <RefundDetails rows={[
      { label: 'Why', value: order ? `Original refund for ${order.item}` : 'Original supplier adjustment' },
      { label: 'Money route', value: item.carrierReceivedPaisa > 0 || action?.suffix === 'courier' ? 'Courier reimbursement to Hastabazaar'
        : canUseEarnings ? 'Eligible seller earnings under the accepted plan' : 'Seller repayment to Hastabazaar' },
      { label: 'Remaining', value: recoveryMoney(position.remainingPaisa) },
    ]} />
    <NextStepBox>{next}</NextStepBox>
    <div className="flex flex-wrap gap-2">
      {action ? <RefundReviewButton targetId={`recovery-${current.id}-${action.suffix}`}>{action.label}</RefundReviewButton> : null}
      {canOpenOrder && source.orderId && order ? <Link href={withAdminReturnTo(`/admin/orders/${encodeURIComponent(source.orderId)}`, currentHref)}
        className="inline-flex min-h-11 items-center rounded-[10px] border border-[#D3C5AD] px-4 py-2.5 text-sm font-semibold text-[#14213D] hover:bg-[#F7F3EC]">
        Open order {order.orderNumber}
      </Link> : null}
    </div>
  </>;
}
