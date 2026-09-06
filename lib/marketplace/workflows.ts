import type {
  ComplaintStatus,
  OrderStatus,
  ProductStatus,
  ReturnRequestStatus,
  SellerStatus,
} from './types';

export const sellerTransitions: Readonly<
  Record<SellerStatus, readonly SellerStatus[]>
> = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['needs_changes', 'approved', 'rejected'],
  needs_changes: ['submitted'],
  approved: ['suspended'],
  rejected: ['draft'],
  suspended: ['under_review'],
};

export const productTransitions: Readonly<
  Record<ProductStatus, readonly ProductStatus[]>
> = {
  draft: ['submitted', 'archived'],
  submitted: ['under_review'],
  under_review: ['needs_changes', 'approved', 'rejected'],
  needs_changes: ['submitted', 'archived'],
  approved: ['published', 'archived'],
  published: ['under_review', 'archived'],
  rejected: ['draft', 'archived'],
  archived: ['draft'],
};

export const orderTransitions: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['packing', 'cancelled'],
  packing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'return_requested'],
  delivered: ['return_requested'],
  cancelled: ['refund_processing'],
  return_requested: ['return_in_transit', 'refund_processing'],
  return_in_transit: ['returned'],
  returned: ['refund_processing'],
  refund_processing: ['refunded'],
  refunded: [],
};

export const returnRequestTransitions: Readonly<
  Record<ReturnRequestStatus, readonly ReturnRequestStatus[]>
> = {
  requested: ['under_investigation', 'needs_customer_changes', 'pending_high_value_approval', 'approved', 'rejected'],
  under_investigation: ['needs_customer_changes', 'pending_high_value_approval', 'approved', 'rejected'],
  needs_customer_changes: ['under_investigation', 'rejected'],
  pending_high_value_approval: ['approved', 'rejected'],
  approved: ['in_transit', 'resolved'],
  rejected: [],
  in_transit: ['received'],
  received: ['resolved'],
  resolved: [],
};

export const complaintTransitions: Readonly<
  Record<ComplaintStatus, readonly ComplaintStatus[]>
> = {
  open: ['assigned', 'investigating', 'escalated', 'resolved'],
  assigned: ['investigating', 'waiting_customer', 'escalated', 'resolved'],
  investigating: ['waiting_customer', 'escalated', 'resolved'],
  waiting_customer: ['investigating', 'escalated', 'resolved'],
  escalated: ['investigating', 'waiting_customer', 'resolved'],
  resolved: ['closed', 'investigating'],
  closed: [],
};

export function isAllowedTransition<State extends string>(
  transitions: Readonly<Record<State, readonly State[]>>,
  from: State,
  to: State,
): boolean {
  return transitions[from].includes(to);
}

export const sellerReverificationFields = [
  'legalName',
  'businessRegistrationNumber',
  'taxRegistrationNumber',
  'authorisedRepresentative',
  'ownership',
  'payoutAccount',
] as const;

export const criticalProductReviewFields = [
  'name',
  'description',
  'category',
  'price',
  'materials',
  'producer',
  'countryOfOrigin',
  'safetyClaims',
  'warranty',
  'returnEligibility',
  'licence',
] as const;
