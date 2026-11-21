import { isGregorianDate, nepalDayIso } from '@/lib/dates/nepal-calendar';
import { reviewDueAt, reviewHasAssignment, reviewTaskLabels, reviewTaskOpen, reviewTitle, type ReviewQueueTask } from '@/lib/admin/review-queue-view';
import { reviewTaskHref } from '@/lib/admin/review-task-links';

type TodaySection = 'Today' | 'Orders' | 'Care' | 'Sellers' | 'Catalog' | 'Money' | 'Settings';
export type TaskAssignment = { taskId: string; revision: number };
export type TodayTask = {
  id: string;
  section: TodaySection;
  type: string;
  title: string;
  context: string;
  startedAt: number;
  dueAt: number | null;
  state: 'action' | 'waiting' | 'done';
  ownerId: string | null;
  ownerName: string | null;
  ownerKnown?: boolean;
  assignment: TaskAssignment | null;
  href: string;
  action: string;
  codConfirmationOrderId?: string;
};
export type TodayTaskCopy = Partial<Pick<TodayTask, 'type' | 'title' | 'context' | 'href' | 'action'>> & { sellerName?: string };

export const todayShortDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu',
});

export const todayViews = [
  ['action', 'Needs action', 'All clear', 'Nothing needs a decision right now.'],
  ['mine', 'Mine', 'Nothing assigned to you', 'Pick a task to get started.'],
  ['unowned', 'No owner', 'Every task has an owner', ''],
  ['waiting', 'Waiting', 'Nothing waiting on others', ''],
  ['done', 'Done today', 'No decisions recorded yet today', 'Finished tasks with a recorded outcome appear here until midnight, Nepal time.'],
] as const;
export type TodayView = typeof todayViews[number][0];
export type TodayFilters = { section: string; type: string; from: string; to: string };
export const emptyTodayFilters: TodayFilters = { section: '', type: '', from: '', to: '' };

export function readTodayFilters(params: Pick<URLSearchParams, 'get'>) {
  const view = todayViews.find(([key]) => key === params.get('todayView'))?.[0] ?? 'action';
  const from = params.get('todayFrom') ?? '', to = params.get('todayTo') ?? '';
  const filters: TodayFilters = {
    section: params.get('todaySection') ?? '',
    type: params.get('todayType') ?? '',
    from: isGregorianDate(from) ? from : '',
    to: isGregorianDate(to) ? to : '',
  };
  return { view, filters };
}

const ageOrder = (a: TodayTask, b: TodayTask) => a.startedAt - b.startedAt || a.id.localeCompare(b.id);
export function todayTaskOverdue(task: TodayTask, now: number) {
  return task.state === 'action' && task.dueAt !== null && task.dueAt < now;
}

export function oldestAvailableTodayTask(tasks: readonly TodayTask[]) {
  return tasks.filter(task => task.state === 'action' && !task.ownerId && task.assignment).sort(ageOrder)[0];
}

export function todayQueue(tasks: readonly TodayTask[], actorId: string, now: number, filters: TodayFilters) {
  const matches = tasks.filter(task => {
    if (filters.section && task.section !== filters.section || filters.type && task.type !== filters.type) return false;
    if (!filters.from && !filters.to) return true;
    const date = nepalDayIso(task.startedAt);
    return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  }).sort((a, b) => Number(todayTaskOverdue(b, now)) - Number(todayTaskOverdue(a, now)) || ageOrder(a, b));
  const action = matches.filter(task => task.state === 'action');
  return {
    action,
    mine: action.filter(task => task.ownerId === actorId),
    unowned: action.filter(task => !task.ownerId && task.ownerKnown !== false),
    waiting: matches.filter(task => task.state === 'waiting'),
    done: matches.filter(task => task.state === 'done'),
  };
}

const presentation: Record<ReviewQueueTask['sourceType'], readonly [TodaySection, string, string]> = {
  payout_request: ['Money', 'Payouts', 'Review payout'],
  payout_candidate: ['Money', 'Payouts', 'Prepare payout'],
  payout_packet: ['Money', 'Payouts', 'Open transfer'],
  refund_obligation: ['Money', 'Refunds', 'Open refund'],
  refund_source: ['Money', 'Refunds', 'Review funding'],
  system_incident: ['Settings', 'System checks', 'Open issue'],
  team_governance: ['Settings', 'Team', 'Review access'],
  recovery_claim: ['Money', 'Recoveries', 'Review claim'],
  recovery_review: ['Money', 'Recoveries', 'Open recovery'],
  recovery_contact: ['Money', 'Recoveries', 'Review response'],
  return_request: ['Care', 'Returns', 'Open case'],
  complaint: ['Care', 'Complaints', 'Open case'],
  cancellation_review: ['Orders', 'Cancellation', 'Open order'],
  order_response: ['Orders', 'Preparation', 'Review response'],
  payment_claim: ['Money', 'Payments', 'Review payment'],
  payment_exception: ['Money', 'Payments', 'Open exception'],
  product_priority: ['Catalog', 'Product concerns', 'Open concern'],
  product_intake_help: ['Catalog', 'Product intake', 'Review request'],
  product_intake_review: ['Catalog', 'Product intake', 'Review product'],
  commission_terms: ['Money', 'Commission', 'Review terms'],
  company_account: ['Settings', 'Company account', 'Review account'],
  seller_application: ['Sellers', 'Applications', 'Review application'],
  seller_document: ['Sellers', 'Documents', 'Review document'],
  document_change: ['Sellers', 'Updated documents', 'Review change'],
  protected_change: ['Sellers', 'Bank & owner changes', 'Review change'],
  product_review: ['Catalog', 'Products', 'Review product'],
  public_profile: ['Sellers', 'Shop profiles', 'Review profile'],
  public_profile_correction: ['Sellers', 'Shop detail fixes', 'Review correction'],
};

export function reviewTaskCanAssign(task: ReviewQueueTask) {
  return !('finance' in task) && reviewTaskOpen(task) && task.sourceType !== 'product_priority' && !task.assignmentLocked;
}

export function todayReviewTask(task: ReviewQueueTask, returnTo: string, ownerName: string | null, copy?: TodayTaskCopy): TodayTask {
  const [section, type, defaultAction] = presentation[task.sourceType];
  const title = reviewTitle(task);
  const pan = task.sourceType === 'seller_document' && !('finance' in task) && task.recordTitle === 'PAN document';
  const action = pan ? 'Review PAN' : defaultAction;
  const state = task.status === 'awaiting_review' ? 'action' : reviewTaskOpen(task) ? 'waiting' : 'done';
  const product = !('finance' in task) && state === 'action' &&
    (task.sourceType === 'product_review' && ['submitted', 'under_review'].includes(task.sourceStatus) ||
    task.sourceType === 'product_intake_review' && ['submitted', 'in_review', 'ready_for_decision'].includes(task.sourceStatus));
  const source = copy?.context ?? (product
    ? [task.sellerName ?? copy?.sellerName, 'Sent ' + todayShortDate.format(task.startedAt)].filter(Boolean).join(' · ')
    : task.sourceStatus.replaceAll('_', ' '));
  const next = task.nextActor === 'You' ? 'Seller' : task.nextActor;
  return {
    id: task.id, section, type: copy?.type ?? type,
    title: copy?.title ?? (product && task.recordTitle ? 'Review product: ' + task.recordTitle
      : 'finance' in task || !task.sellerName || !('recordTitle' in task)
        ? ('finance' in task ? title : reviewTaskLabels[task.sourceType] + ' · ' + title)
        : title),
    context: state === 'waiting' ? `${source} · Next: ${next}` : source,
    startedAt: task.startedAt,
    dueAt: reviewDueAt(task),
    state,
    ownerId: task.ownerId,
    ownerName,
    ownerKnown: reviewHasAssignment(task),
    assignment: reviewTaskCanAssign(task) && !('finance' in task) ? { taskId: task.id, revision: task.revision } : null,
    href: copy?.href ?? reviewTaskHref(task, returnTo), action: copy?.action ?? (product ? 'Review' : action),
  };
}
