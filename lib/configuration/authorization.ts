import { can, type PermissionSubject } from '../marketplace/permissions';

export class BusinessSettingAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessSettingAuthorizationError';
  }
}

export type BusinessSettingAction = 'view' | 'manage' | 'approve';

type BusinessSettingActor = PermissionSubject & Readonly<{ id: string }>;

const actionPermission = {
  view: 'business_settings.view',
  manage: 'business_settings.manage',
  approve: 'business_settings.approve',
} as const;

export function assertBusinessSettingAuthorization(
  actor: BusinessSettingActor,
  action: BusinessSettingAction,
  _context: Readonly<{ proposedBy?: string | null }> = {},
): void {
  if (!can(actor, actionPermission[action])) {
    throw new BusinessSettingAuthorizationError(
      'Only an authorized Super Admin can perform this business-settings action.',
    );
  }

}
