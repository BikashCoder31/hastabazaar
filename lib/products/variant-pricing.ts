export const VARIANT_PRICING_RULE_VERSION = 'variant-price-addition-v1';

// The hosted binding supplies a schema check when enabled. Isolated D1 fixtures
// can supply true with their own verified schema.
export const VARIANT_PRICING_CAPABILITY: unique symbol = Symbol('variant pricing');

type PricingReadiness = { ready: boolean; missing: string[] };
type PricingCapability = boolean | (() => Promise<PricingReadiness>);

function variantPricingCapability(database: D1Database): PricingCapability | undefined {
  return (database as D1Database & { [VARIANT_PRICING_CAPABILITY]?: PricingCapability })[VARIANT_PRICING_CAPABILITY];
}

export class VariantPricingUnavailableError extends Error {
  constructor() {
    super('Variant pricing is temporarily unavailable.');
  }
}

export async function variantPricingEnabled(database: D1Database): Promise<boolean> {
  const capability = variantPricingCapability(database);
  if (typeof capability !== 'function') return capability === true;
  // A failing check must block pricing-dependent requests. Falling back here
  // could silently change prices between catalogue, cart and checkout.
  if (!(await capability()).ready) throw new VariantPricingUnavailableError();
  return true;
}

export async function inspectVariantPricingReadiness(database: D1Database): Promise<PricingReadiness> {
  const capability = variantPricingCapability(database);
  if (typeof capability === 'function') return capability();
  return { ready: true, missing: [] };
}

const PAISA_PER_RUPEE = 100;
const RETURNABLE_THRESHOLD_PAISA = 40_000;
const BELOW_THRESHOLD_ADDITION_PAISA = 4_000;
const AT_OR_ABOVE_THRESHOLD_ADDITION_PAISA = 8_000;
// Five percent of this many paisa is one whole rupee.
const PAISA_PER_PERCENTAGE_STEP = 2_000;
const HALF_PERCENTAGE_STEP = PAISA_PER_PERCENTAGE_STEP / 2;

export interface ApprovedVariantPricing {
  ruleVersion: typeof VARIANT_PRICING_RULE_VERSION;
  sellerBasePaisa: number;
  returnEligible: boolean;
  additionPaisa: number;
  customerUnitPaisa: number;
}

export function priceApprovedVariant(sellerBasePaisa: number, returnEligible: boolean): ApprovedVariantPricing {
  if (!Number.isSafeInteger(sellerBasePaisa) || sellerBasePaisa < 0 || typeof returnEligible !== 'boolean') {
    throw new RangeError('Use a safe integer approved selling price and a return policy.');
  }
  const additionPaisa = returnEligible
    ? sellerBasePaisa < RETURNABLE_THRESHOLD_PAISA ? BELOW_THRESHOLD_ADDITION_PAISA : AT_OR_ABOVE_THRESHOLD_ADDITION_PAISA
    : Number((BigInt(sellerBasePaisa) + BigInt(HALF_PERCENTAGE_STEP)) / BigInt(PAISA_PER_PERCENTAGE_STEP)) * PAISA_PER_RUPEE;
  const customerUnitPaisa = sellerBasePaisa + additionPaisa;
  if (!Number.isSafeInteger(customerUnitPaisa)) throw new RangeError('The customer price exceeds supported money precision.');
  return { ruleVersion: VARIANT_PRICING_RULE_VERSION, sellerBasePaisa, returnEligible, additionPaisa, customerUnitPaisa };
}

/** Catalogue filtering and sorting use the same rule as the selected-offer projection. */
export function variantCustomerUnitPriceSql(baseSql: string, returnEligibleSql: string, dialect: 'sqlite' | 'mariadb'): string {
  const base = `(${baseSql})`;
  const quotient = dialect === 'mariadb'
    ? `${base} DIV ${PAISA_PER_PERCENTAGE_STEP}`
    : `CAST(${base} / ${PAISA_PER_PERCENTAGE_STEP} AS INTEGER)`;
  const rounded = `(${quotient} + CASE WHEN ${base} % ${PAISA_PER_PERCENTAGE_STEP} >= ${HALF_PERCENTAGE_STEP} THEN 1 ELSE 0 END)`;
  return `(${base} + CASE WHEN (${returnEligibleSql}) = 1 THEN
    CASE WHEN ${base} < ${RETURNABLE_THRESHOLD_PAISA} THEN ${BELOW_THRESHOLD_ADDITION_PAISA} ELSE ${AT_OR_ABOVE_THRESHOLD_ADDITION_PAISA} END
    ELSE ${rounded} * ${PAISA_PER_RUPEE} END)`;
}

/** Raw SQL inputs come from the caller's product and offer-version columns. */
export function variantPricingPublishedOfferSql(productIdSql: string, offerVersionSql: string): string {
  return `EXISTS (
    SELECT 1 FROM product_publication_heads pricing_head
    JOIN product_publication_candidates pricing_candidate
      ON pricing_candidate.id = pricing_head.current_version_id AND pricing_candidate.product_id = pricing_head.product_id
    JOIN product_publication_decisions pricing_decision
      ON pricing_decision.id = pricing_head.current_publication_id AND pricing_decision.version_id = pricing_candidate.id
    WHERE pricing_head.product_id = (${productIdSql}) AND pricing_candidate.offer_version_id = (${offerVersionSql})
      AND pricing_decision.action IN ('approve_and_publish', 'publish_approved') AND pricing_decision.public_json IS NOT NULL
  )`;
}
