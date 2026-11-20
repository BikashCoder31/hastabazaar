import { BUILT_IN_STAFF_ACCESS_TEMPLATES } from '@/lib/staff/access';
import type { Permission } from '@/lib/marketplace/permissions';

export const STAFF_INVITATION_PRESETS = [
  { name: 'Orders & Care', templates: ['orders-assistant', 'customer-support'] },
  { name: 'Catalog & Sellers', templates: ['product-reviewer', 'seller-reviewer'] },
  {
    name: 'Money (view only)',
    templates: ['reports-only'],
    scope: 'Reports only. Payouts, courier cash and refunds require separate access.',
  },
].map(({ name, templates, scope }) => ({
  name,
  scope,
  permissions: BUILT_IN_STAFF_ACCESS_TEMPLATES.filter((template) =>
    templates.includes(template.id),
  ).flatMap((template) => template.permissions),
}));

export function staffInvitationPreset(permissions: readonly Permission[]) {
  return STAFF_INVITATION_PRESETS.find((preset) =>
    preset.permissions.length === permissions.length &&
    preset.permissions.every((permission) => permissions.includes(permission)),
  );
}
