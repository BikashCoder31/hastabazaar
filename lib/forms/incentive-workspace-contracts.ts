import type { FormDefinition, FormMode } from './types';
export const LOYALTY_SETTINGS_ACTIONS=['draft','publish','pause','cancel_schedule'] as const;
export type LoyaltySettingsAction=typeof LOYALTY_SETTINGS_ACTIONS[number];
export function isLoyaltySettingsAction(value:unknown):value is LoyaltySettingsAction{return LOYALTY_SETTINGS_ACTIONS.some(action=>action===value);}

function nativeForm(
  id: string,
  route: string,
  mode: FormMode,
  keys: string[],
): FormDefinition {
  return Object.freeze({
    id,
    route,
    mode,
    audience: 'super_admin',
    adapterId: id,
    baseFields: Object.freeze(
      keys.map((key) => ({
        key,
        type: 'existing',
        label: key,
        capability: 'protected' as const,
        explanation:
          'The native workspace owns these controls; validation, permissions and stored financial snapshots remain enforced.',
      })),
    ),
    capabilities: Object.freeze({
      explanation:
        mode === 'query'
          ? 'These native filters only select existing report records. They add no answers or financial changes.'
          : 'This native commission operation uses immutable rate history and explicit authority checks. Custom fields and generic answer recording are unavailable.',
      customFieldTypes: Object.freeze([]),
      answerBehavior: mode === 'query' ? 'query' : 'none',
    }),
  });
}
export const INCENTIVE_WORKSPACE_FORM_CONTRACTS: Readonly<
  Record<string, FormDefinition>
> = Object.freeze({
  'staff.referral-report-filter': nativeForm(
    'staff.referral-report-filter',
    '/admin/referrals',
    'query',
    ['view', 'period', 'q', 'status', 'page'],
  ),
  'staff.promo-report-filter': nativeForm(
    'staff.promo-report-filter',
    '/admin/promo-codes',
    'query',
    ['query', 'from', 'to', 'page', 'historyPage'],
  ),
  'staff.loyalty-report-filter': nativeForm(
    'staff.loyalty-report-filter',
    '/admin/loyalty',
    'query',
    ['query', 'from', 'to', 'page', 'customerPage', 'historyPage'],
  ),
  'staff.commission-report-filter': nativeForm(
    'staff.commission-report-filter',
    '/admin/commission',
    'query',
    ['query', 'from', 'to', 'sellerId', 'status', 'page'],
  ),
  'staff.commission-schedule': nativeForm(
    'staff.commission-schedule',
    '/api/admin/commission',
    'operation',
    [
      'percent',
      'effectiveAt',
      'reason',
      'expectedRevision',
      'requestId',
      'actorId',
    ],
  ),
  'staff.commission-cancel': nativeForm(
    'staff.commission-cancel',
    '/api/admin/commission',
    'operation',
    ['changeId', 'reason', 'expectedRevision', 'requestId', 'actorId'],
  ),
});
