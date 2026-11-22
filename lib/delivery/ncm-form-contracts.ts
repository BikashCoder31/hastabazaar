import type { FormDefinition } from '../forms/types';

function fixedNcmForm(
  id: string,
  route: string,
  audience: FormDefinition['audience'],
  fields: readonly [key: string, label: string][],
  explanation: string,
): FormDefinition {
  return {
    id,
    route,
    audience,
    mode: 'system',
    adapterId: id,
    baseFields: fields.map(([key, label]) => ({
      key,
      label,
      type: 'existing',
      capability: 'protected',
      explanation: 'The NCM workflow validates this field and keeps it outside generic form answers.',
    })),
    capabilities: { customFieldTypes: [], answerBehavior: 'none', explanation },
  };
}

export const NCM_FORM_CONTRACTS = {
  'system.ncm-pickup-branch': fixedNcmForm(
    'system.ncm-pickup-branch', '/api/admin/delivery-partners/ncm', 'super_admin',
    [['branch', 'Pickup branch']],
    'Super Admin confirms an assigned NCM branch for the current seller pickup address.',
  ),
  'system.ncm-booking-defaults': fixedNcmForm(
    'system.ncm-booking-defaults', '/api/admin/delivery-partners/ncm', 'super_admin',
    [['deliveryType', 'Default delivery type'], ['packageName', 'Default package name']],
    'Super Admin saves NCM booking defaults against the current settings revision.',
  ),
  'system.ncm-parcel-action': fixedNcmForm(
    'system.ncm-parcel-action', '/api/admin/delivery-partners/ncm/dispatch', 'staff',
    [['note', 'Courier note or return reason']],
    'Authorized dispatch staff record a portal check before retrying, send a note or request a return through the NCM workflow.',
  ),
} as const;
