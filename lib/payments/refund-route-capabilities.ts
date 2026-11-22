export const REFUND_ROUTE_CAPABILITIES: unique symbol = Symbol(
  'refund route capabilities',
);

export interface RefundRouteCapabilities {
  readonly fonepaySimulationAdmission: boolean;
  readonly fonepaySimulationRetainedRead: boolean;
  readonly refundWalletBalance: boolean;
  readonly refundWalletShopping: boolean;
  readonly refundWalletWithdrawal: boolean;
  readonly refundWalletFees: boolean;
}

type RefundRouteBinding = object & {
  [REFUND_ROUTE_CAPABILITIES]?: Partial<RefundRouteCapabilities>;
};

/** New refund route controls require an explicit binding. Existing shopping credit is independent. */
export function readRefundRouteCapabilities(
  binding?: object,
): RefundRouteCapabilities {
  const capabilities = (binding as RefundRouteBinding | undefined)?.[
    REFUND_ROUTE_CAPABILITIES
  ];
  return {
    fonepaySimulationAdmission:
      capabilities?.fonepaySimulationAdmission === true,
    fonepaySimulationRetainedRead:
      capabilities?.fonepaySimulationRetainedRead === true,
    refundWalletBalance: capabilities?.refundWalletBalance === true,
    refundWalletShopping: capabilities?.refundWalletShopping === true,
    refundWalletWithdrawal: capabilities?.refundWalletWithdrawal === true,
    refundWalletFees: capabilities?.refundWalletFees === true,
  };
}
