import type { NepalAddress } from '../shipping/provider';
import type { CustomerAddressRow } from '../db/repositories/customers';
import { normalizeDistrict, normalizeProvince } from './nepal-address';
import { normalizeNepalMobile } from '../auth/nepal-phone';

/** Compare destinations without changing either the saved record or the order snapshot. */
export function matchesSavedDeliveryAddress(address: NepalAddress, saved: CustomerAddressRow): boolean {
  const text = (value: string | null | undefined) => value?.trim() ?? '';
  const phone = (value: string) => {
    const mobile = normalizeNepalMobile(value);
    if (mobile) return mobile;
    const compact = text(value).replace(/[\s()-]/g, '');
    if (/^\+977\d{7,10}$/.test(compact)) return compact.slice(4);
    return /^977\d{8,10}$/.test(compact) && compact.length > 10 ? compact.slice(3) : compact;
  };
  const ward = (value: string | null | undefined) => text(value) ? String(Number(value)) : '';
  return text(address.recipientName) === text(saved.recipientName)
    && phone(address.phone) === phone(saved.phone)
    && normalizeProvince(address.province) === normalizeProvince(saved.province)
    && normalizeDistrict(address.district) === normalizeDistrict(saved.district)
    && text(address.municipality) === text(saved.municipality)
    && ward(address.ward) === ward(saved.ward)
    && text(address.locality) === text(saved.locality)
    && text(address.landmark) === text(saved.landmark)
    && text(address.postalCode) === text(saved.postalCode)
    && (address.location?.latitude ?? null) === (saved.latitude ?? null)
    && (address.location?.longitude ?? null) === (saved.longitude ?? null);
}
