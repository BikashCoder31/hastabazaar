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
  'business_settings.view',
  'business_settings.manage',
  'business_settings.approve',
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

export interface PermissionSubject {
  role: MarketplaceRole;
  /** Undefined preserves legacy role access; an empty list revokes all configurable access. */
  permissions?: readonly Permission[];
}

export const configurableAdminPermissions = adminPermissions.filter(
  (permission) => !customerPermissions.includes(permission),
);

export function validateAdminPermissions(value: unknown): Permission[] {
  if (!Array.isArray(value) || value.some((item) => !configurableAdminPermissions.includes(item))) {
    throw new Error('Select only the listed Admin permissions. Reserved Super Admin actions cannot be delegated.');
  }
  return configurableAdminPermissions.filter((item) => value.includes(item));
}

export function effectivePermissions(subject: PermissionSubject): readonly Permission[] {
  if (subject.role !== 'admin' || subject.permissions === undefined) return rolePermissions[subject.role];
  return [...customerPermissions, ...configurableAdminPermissions.filter((item) => subject.permissions!.includes(item))];
}

export function can(subject: MarketplaceRole | PermissionSubject, permission: Permission): boolean {
  return effectivePermissions(typeof subject === 'string' ? { role: subject } : subject).includes(permission);
}

export const superAdminApprovalRequiredFor = [
  'commercial_policy.manage',
  'tax_policy.manage',
  'admin.permissions.manage',
  'refund.approve.high_value',
  'payout.approve',
  'seller.suspend',
  'business_settings.approve',
] as const satisfies readonly Permission[];

export const nonDelegableProtections = [
  'An actor cannot approve their own seller application or product, or review their own rider cash.',
  'An admin cannot change their own role or permissions.',
  'Only a super admin can grant or revoke admin access.',
  'Payouts prepared by an authorized active Super Admin are approved directly; Admin preparations require Super Admin confirmation. Financial checks and audit records remain required.',
  'Audit records are append-only; even super admins cannot delete them through the application.',
  'An authorized Super Admin can save controlled business settings directly; validation, effective-date rules and audit records remain required.',
] as const;
