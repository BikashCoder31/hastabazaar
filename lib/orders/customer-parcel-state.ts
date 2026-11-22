import type { CustomerActor } from '@/components/storefront/customer-acting-chip';
import type { CustomerParcelCondition, CustomerParcelStage } from '@/components/storefront/customer-parcel-progress';

export type CustomerParcelState = {
  actor: CustomerActor;
  stage: CustomerParcelStage;
  condition?: CustomerParcelCondition;
  label: string;
};

export function customerParcelState({ status, proposedDate = false, bankDue = false, bankReview = false, codPending = false }: {
  status: string;
  proposedDate?: boolean;
  bankDue?: boolean;
  bankReview?: boolean;
  codPending?: boolean;
}): CustomerParcelState {
  switch (status) {
    case 'cancelled': return { actor: 'done', stage: 'placed', label: 'Cancelled' };
    case 'delivered': return { actor: 'done', stage: 'delivered', label: 'Delivered' };
    case 'returned': return { actor: 'done', stage: 'with-courier', condition: 'problem', label: 'Returned to the seller' };
    case 'return_to_origin':
    case 'returning': return { actor: 'courier', stage: 'with-courier', condition: 'problem', label: 'Going back to the seller' };
    case 'delivery_failed': return { actor: 'hastabazaar', stage: 'with-courier', condition: 'problem', label: 'Delivery missed' };
    case 'picked_up': return { actor: 'courier', stage: 'with-courier', label: 'Picked up by the courier' };
    case 'in_transit': return { actor: 'courier', stage: 'with-courier', label: 'On the way' };
    case 'out_for_delivery': return { actor: 'courier', stage: 'with-courier', label: 'Out for delivery' };
    case 'dispatched': return { actor: 'courier', stage: 'with-courier', label: 'With the courier' };
  }
  if (bankDue) return { actor: 'you', stage: 'placed', condition: 'waiting', label: 'Waiting for your bank transfer' };
  if (bankReview) return { actor: 'hastabazaar', stage: 'placed', condition: 'waiting', label: 'Checking your payment' };
  if (codPending || status === 'awaiting_cod_confirmation') {
    return { actor: 'hastabazaar', stage: 'placed', condition: 'waiting', label: 'Waiting for phone confirmation' };
  }
  if (proposedDate) return { actor: 'you', stage: 'preparing', condition: 'waiting', label: 'The seller needs your answer' };
  switch (status) {
    case 'pickup_requested':
    case 'label_pending':
    case 'label_ready':
    case 'pickup_scheduled':
    case 'ready_for_pickup': return { actor: 'courier', stage: 'packed', label: 'Waiting for courier pickup' };
    case 'packing':
    case 'confirmed': return { actor: 'seller', stage: 'preparing', label: 'Being prepared' };
    default: return { actor: 'hastabazaar', stage: 'placed', label: 'Order placed' };
  }
}

export function customerDeliveryProblem(value: string | null) {
  switch (value) {
    case 'not_reached': return 'The courier couldn’t reach you.';
    case 'wrong_address': return 'The courier couldn’t find the delivery address.';
    case 'refused': return 'The courier recorded that the parcel was refused.';
    case 'courier_problem': return 'The courier reported a delivery problem.';
    default: return 'Get help to check the next delivery step.';
  }
}

export const customerDate = (value: number) => new Intl.DateTimeFormat('en-NP', {
  day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu',
}).format(value);

export const customerDateTime = (value: number) => new Intl.DateTimeFormat('en-NP', {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kathmandu',
}).format(value);
