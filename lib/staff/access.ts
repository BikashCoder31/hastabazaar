import {
  validateAdminPermissions,
  type Permission,
} from '../marketplace/permissions';

export interface StaffAccessRight {
  permission: Permission;
  label: string;
  description: string;
}

export interface StaffAccessTemplate {
  id: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
  source: 'built-in' | 'saved';
}

export interface StaffAccessComparison {
  added: readonly Permission[];
  removed: readonly Permission[];
  unchanged: readonly Permission[];
}

export const STAFF_ACCESS_RIGHTS: readonly StaffAccessRight[] = [
  {
    permission: 'system.health.view',
    label: 'View service health',
    description: 'Read sanitized service health, form outcomes and scoped technical records. Private business evidence and mail setup remain separately protected.',
  },
  {
    permission: 'system.incidents.manage',
    label: 'Respond to service incidents',
    description: 'Acknowledge and update eligible assigned incidents with recovery evidence. Sensitive closure and severity reductions require Super Admin authority.',
  },
  {
    permission: 'payment.receipt.verify',
    label: 'Verify ordinary incoming receipts',
    description: 'Inspect scoped company receipt evidence and confirm ordinary completed incoming payments. Exceptions, COD remittance and seller recovery retain their separate Super Admin checks.',
  },
  {
    permission: 'seller.application.review',
    label: 'Review sellers',
    description:
      'Read seller applications and record review decisions. Suspending sellers still requires a Super Admin.',
  },
  {
    permission: 'product.review',
    label: 'Review products and customer reviews',
    description:
      'Review product submissions and approve, hide or reject customer reviews and seller replies. Publishing products needs separate access.',
  },
  {
    permission: 'product.publish',
    label: 'Publish products',
    description:
      'Publish approved products. Review products access is also needed to open the product review workspace.',
  },
  {
    permission: 'catalog.manage',
    label: 'Manage the catalog',
    description:
      'Manage categories, occasions, product classifications, listing rules and promotion proposals.',
  },
  {
    permission: 'order.manage',
    label: 'Manage orders and shipping',
    description:
      'Manage orders, cancellations, shipping and delivery claims; retry order emails and follow up on order and delivery problems. Rider controls still require a Super Admin.',
  },
  {
    permission: 'support.manage',
    label: 'Help customers',
    description:
      'View the return queue and handle complaints, feedback and privacy requests. Return decisions and refund approval need separate access.',
  },
  {
    permission: 'refund.approve.standard',
    label: 'Review returns and standard refunds',
    description:
      'Review return requests and standard refunds. High-value refunds still require a Super Admin.',
  },
  {
    permission: 'payout.prepare',
    label: 'Prepare seller payouts',
    description:
      'Prepare seller payouts and review payout requests. A Super Admin approves payouts and records payment.',
  },
  {
    permission: 'audit_log.view',
    label: 'View reports and recorded work',
    description:
      'View reports, the overview and recorded work allowed by existing access. This does not open every work area. The full action audit is for Super Admins.',
  },
];

export const BUILT_IN_STAFF_ACCESS_TEMPLATES: readonly StaffAccessTemplate[] = [
  {
    id: 'technical-responder',
    name: 'Technical responder',
    description: 'View sanitized health and respond to assigned incidents. Staff access, private business evidence, publication and financial execution need their own authority.',
    permissions: ['system.health.view', 'system.incidents.manage'],
    source: 'built-in',
  },
  {
    id: 'orders-assistant',
    name: 'Orders assistant',
    description:
      'Manage orders, shipping, cancellations and delivery claims; retry order emails and follow up on order and delivery problems. Rider controls require a Super Admin.',
    permissions: ['order.manage'],
    source: 'built-in',
  },
  {
    id: 'customer-support',
    name: 'Customer support',
    description:
      'View the return queue and handle complaints, feedback and privacy requests. Return decisions and refund approval need separate access.',
    permissions: ['support.manage'],
    source: 'built-in',
  },
  {
    id: 'product-reviewer',
    name: 'Product reviewer',
    description:
      'Review product submissions and approve, hide or reject customer reviews and seller replies. Publishing products needs separate access.',
    permissions: ['product.review'],
    source: 'built-in',
  },
  {
    id: 'product-publisher',
    name: 'Product publisher',
    description:
      'Review product submissions, publish approved products, and approve, hide or reject customer reviews and seller replies.',
    permissions: ['product.review', 'product.publish'],
    source: 'built-in',
  },
  {
    id: 'seller-reviewer',
    name: 'Seller reviewer',
    description:
      'Review seller applications. Suspending sellers requires a Super Admin.',
    permissions: ['seller.application.review'],
    source: 'built-in',
  },
  {
    id: 'finance-assistant',
    name: 'Finance assistant',
    description:
      'Prepare seller payouts. Approval and payment recording require a Super Admin.',
    permissions: ['payout.prepare'],
    source: 'built-in',
  },
  {
    id: 'reports-only',
    name: 'Reports only',
    description:
      'View reports, the overview and recorded work allowed by existing access. Other work areas are not included. The full action audit is for Super Admins.',
    permissions: ['audit_log.view'],
    source: 'built-in',
  },
  {
    id: 'work-access-off',
    name: 'Work access off',
    description:
      'Turn off these work permissions. The person can still sign in, use their account and shop. Their Admin role stays the same.',
    permissions: [],
    source: 'built-in',
  },
];

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatedPermissions(value: unknown): Permission[] | null {
  try {
    return validateAdminPermissions(value);
  } catch {
    return null;
  }
}

/** Reject the entire saved bundle if any right is unknown or reserved. */
export function parseSavedStaffAccessTemplate(
  value: unknown,
): StaffAccessTemplate | null {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.trim().length > 80 ||
    typeof value.permissionsJson !== 'string'
  )
    return null;
  try {
    const permissions = validatedPermissions(JSON.parse(value.permissionsJson));
    if (permissions === null) return null;
    return {
      id: value.id,
      name: value.name.trim(),
      permissions,
      source: 'saved',
      description:
        'A saved set of work access. Review the allowed work before saving.',
    };
  } catch {
    return null;
  }
}

/** Null is unknown history; an empty array is a known snapshot with work access off. */
export function parseStaffAccessSnapshot(value: unknown): Permission[] | null {
  if (typeof value !== 'string') return null;
  try {
    const snapshot: unknown = JSON.parse(value);
    return object(snapshot) ? validatedPermissions(snapshot.permissions) : null;
  } catch {
    return null;
  }
}

export function compareStaffAccess(
  before: unknown,
  after: unknown,
): StaffAccessComparison | null {
  const previous = validatedPermissions(before);
  const next = validatedPermissions(after);
  if (previous === null || next === null) return null;
  return {
    added: next.filter((permission) => !previous.includes(permission)),
    removed: previous.filter((permission) => !next.includes(permission)),
    unchanged: next.filter((permission) => previous.includes(permission)),
  };
}
