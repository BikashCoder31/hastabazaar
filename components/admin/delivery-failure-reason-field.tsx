import { deliveryFailureReasons } from '@/lib/shipping/delivery-failure';

export function DeliveryFailureReasonField() {
  return <label className="block min-w-0 text-sm font-semibold text-[#46536F]">
    Delivery failure reason
    <select name="failureReason" required defaultValue="" className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-[#D3C5AD] bg-white px-3 text-sm font-normal">
      <option value="" disabled>Choose a reason</option>
      {deliveryFailureReasons.map(([reason, label]) => <option key={reason} value={reason}>{label}</option>)}
    </select>
  </label>;
}
