/**
 * Nepal Can Move is the preferred Phase 1 carrier. Public, authoritative API
 * documentation has not been confirmed, so endpoint paths and credentials must
 * come from the signed merchant onboarding process before an adapter is written.
 */
export const nepalCanMoveIntegration = {
  providerKey: 'nepal_can_move',
  status: 'merchant_contract_required',
  supportedLaunchCapabilities: [
    'nationwide_delivery',
    'cash_on_delivery',
    'shipment_tracking',
    'return_to_origin',
  ],
  implementationRules: [
    'Use only provider-issued API documentation and credentials.',
    'Keep secrets in the deployment environment, never in source control.',
    'Verify webhook signatures and make webhook processing idempotent.',
    'Retain a manual shipment fallback until integration reliability is proven.',
    'Treat Hastabazaar as responsible to the customer even when delivery is outsourced.',
  ],
} as const;
