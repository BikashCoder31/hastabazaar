import type { MarketplaceRole } from './types';

export const permissions = [
  'account.self.manage',
  'catalog.public.view',
  'order.self.manage',
  'seller.application.create',
  'seller.profile.own.manage',
  'seller.product.own.manage',
  'seller.order.own.fulfill',
  'seller.finance.own.view',
  'seller.application.review',
  'seller.suspend',
  'product.review',
  'product.publish',
  'catalog.manage',
  'order.manage',
  'support.manage',
  'refund.approve.standard',
  'refund.approve.high_value',
  'payout.prepare',
  'payout.approve',
  'payout.mark_paid',
  'commercial_policy.manage',
  'tax_policy.manage',
  'shipping_credentials.manage',
  'payment_credentials.manage',
  'admin.invite',
  'admin.permissions.manage',
  'legal_content.publish',
  'audit_log.view',
] as const;

export type Permission = (typeof permissions)[number];

const customerPermissions: readonly Permission[] = [
  'account.self.manage',
  'catalog.public.view',
  'order.self.manage',
  'seller.application.create',
];

const sellerPermissions: readonly Permission[] = [
  ...customerPermissions,
  'seller.profile.own.manage',
  'seller.product.own.manage',
  'seller.order.own.fulfill',
  'seller.finance.own.view',
];

const adminPermissions: readonly Permission[] = [
  ...customerPermissions,
  'seller.application.review',
  'product.review',
  'product.publish',
  'catalog.manage',
  'order.manage',
  'support.manage',
  'refund.approve.standard',
  'payout.prepare',
  'audit_log.view',
];

export const rolePermissions: Readonly<
  Record<MarketplaceRole, readonly Permission[]>
> = {
  customer: customerPermissions,
  seller: sellerPermissions,
  admin: adminPermissions,
  super_admin: permissions,
};

export function can(role: MarketplaceRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export const dualApprovalRequiredFor = [
  'commercial_policy.manage',
  'tax_policy.manage',
  'admin.permissions.manage',
  'refund.approve.high_value',
  'payout.approve',
  'seller.suspend',
] as const satisfies readonly Permission[];

export const nonDelegableProtections = [
  'An actor cannot approve their own seller, product, refund, or payout action.',
  'An admin cannot change their own role or permissions.',
  'Only a super admin can grant or revoke admin access.',
  'Payout preparation and payout approval must be performed by different actors.',
  'Audit records are append-only; even super admins cannot delete them through the application.',
] as const;
