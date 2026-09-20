export const orderStages = [
  {
    status: 'confirmed',
    label: 'Confirmed',
    detail: 'We have received your order.',
  },
  {
    status: 'packing',
    label: 'Being prepared',
    detail: 'Your makers are preparing your items.',
  },
  {
    status: 'ready_for_pickup',
    label: 'Ready for pickup',
    detail: 'Your parcel is ready for the delivery team.',
  },
  {
    status: 'dispatched',
    label: 'On the way',
    detail: 'Your parcel has been handed to the delivery team.',
  },
  {
    status: 'delivered',
    label: 'Delivered',
    detail: 'Your order has been marked delivered.',
  },
] as const;
export function orderProgress(status: string) {
  if (status === 'cancelled')
    return {
      label: 'Cancelled',
      detail: 'This order was cancelled. No cash payment is due.',
      step: -1,
    };
  const step = orderStages.findIndex((s) => s.status === status);
  return step >= 0
    ? { ...orderStages[step], step }
    : {
        label: 'Update pending',
        detail: 'Contact us if you need help with this order.',
        step: -1,
      };
}
