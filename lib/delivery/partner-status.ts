export const deliveryPartnerStatuses = [
  { value: 'in_use', label: 'In use' },
  { value: 'setting_up', label: 'Being set up' },
  { value: 'not_in_use', label: 'Not in use' },
] as const;

export type DeliveryPartnerStatus = typeof deliveryPartnerStatuses[number]['value'];
