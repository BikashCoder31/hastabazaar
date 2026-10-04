import { normalizeDistrict } from './nepal-address';

// Describe the current rate and approved address-acceptance boundary without
// promising when an operations/courier coverage check will take place.
export const DELIVERY_ESTIMATE_NOTICE =
  'This estimate uses the current district rate. It does not confirm delivery availability at your address. Delivery is available only to an address accepted for your order.';

export type DeliveryDistrictFeedback =
  | { status: 'empty' | 'invalid'; district: null; message: string }
  | { status: 'valid'; district: string; message: string };

export function deliveryDistrictFeedback(
  value: string,
): DeliveryDistrictFeedback {
  if (!value.trim()) {
    return {
      status: 'empty',
      district: null,
      message:
        'Choose or type your delivery district to see the charge and estimated arrival.',
    };
  }
  const district = normalizeDistrict(value);
  if (district)
    return { status: 'valid', district, message: `Estimate for ${district}.` };
  return {
    status: 'invalid',
    district: null,
    message: /^(nawalparasi|rukum)$/i.test(value.trim())
      ? 'Choose East or West for Nawalparasi or Rukum from the suggestions.'
      : 'Choose a recognised Nepal district from the suggestions. No delivery charge is available for this entry.',
  };
}
