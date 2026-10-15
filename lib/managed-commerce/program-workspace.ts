export interface ManagedProgramProduct {
  id: string;
  name: string;
  sku: string;
}

export interface ManagedSupplySummary {
  id: string;
  productName: string;
  quantityProposed: number;
  quantityAccepted: number | null;
  agreedUnitPaisa: number;
  acceptedTotalPaisa: number | null;
  status: string;
  possessionStatus: string;
  qualityStatus: string;
  evidenceReference: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  originalOwedPaisa: number | null;
  adjustedPaisa: number;
  paidPaisa: number;
  createdAt: number;
}

export interface RouteTransitionSummary {
  id: string;
  status: string;
  legalName: string;
  taxMode: string;
  effectiveAt: number | null;
  reviewReason: string | null;
  createdAt: number;
  acceptedTerms?: {commissionBps:number;agreementVersion:string;language:string;acceptedAt:number;document:string;evidence:readonly {id:string;kind:string}[]}|null;
}

export interface ManagedProgramWorkspace {
  participationRoute: 'registered_seller' | 'managed_maker' | null;
  applicationStage: string | null;
  commercialModel:
    | 'managed_sale_linked_percentage_v1'
    | 'managed_fixed_supplier_price_v1'
    | null;
  products: readonly ManagedProgramProduct[];
  supplies: readonly ManagedSupplySummary[];
  transitions: readonly RouteTransitionSummary[];
}

export async function getManagedProgramWorkspace(
  database: D1Database,
  sellerId: string,
): Promise<ManagedProgramWorkspace> {
  const participation = await database
    .prepare(`SELECT participation_route AS participationRoute,
      application_stage AS applicationStage, commercial_model AS commercialModel
      FROM seller_participation_profiles WHERE seller_id=?`)
    .bind(sellerId)
    .first<{
      participationRoute: ManagedProgramWorkspace['participationRoute'];
      applicationStage: string | null;
      commercialModel: ManagedProgramWorkspace['commercialModel'];
    }>();
  const [products, supplies, transitions] = await Promise.all([
    database.prepare(`SELECT id,name_en AS name,sku FROM products
      WHERE seller_id=? ORDER BY updated_at DESC,id`).bind(sellerId).all<ManagedProgramProduct>(),
    database.prepare(`SELECT supply.id,products.name_en AS productName,
      supply.quantity_proposed AS quantityProposed,
      supply.quantity_accepted AS quantityAccepted,
      supply.agreed_unit_paisa AS agreedUnitPaisa,
      supply.accepted_total_paisa AS acceptedTotalPaisa,
      supply.status,supply.possession_status AS possessionStatus,
      supply.quality_status AS qualityStatus,
      supply.evidence_reference AS evidenceReference,
      (SELECT id FROM managed_supplier_payments WHERE obligation_id=supply.id ORDER BY created_at DESC LIMIT 1) AS paymentId,
      (SELECT status FROM managed_supplier_payments WHERE obligation_id=supply.id ORDER BY created_at DESC LIMIT 1) AS paymentStatus,
      obligation.original_amount_paisa AS originalOwedPaisa,
      COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_adjustments WHERE obligation_id=supply.id),0) AS adjustedPaisa,
      COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_payments WHERE obligation_id=supply.id AND status='paid'),0) AS paidPaisa,
      supply.created_at AS createdAt
      FROM managed_supply_records supply JOIN products ON products.id=supply.product_id
      LEFT JOIN managed_supplier_obligations obligation ON obligation.id=supply.id
      WHERE supply.seller_id=? ORDER BY supply.created_at DESC,supply.id`).bind(sellerId).all<ManagedSupplySummary>(),
    database.prepare(`SELECT id,status,legal_name AS legalName,tax_mode AS taxMode,registered_terms_snapshot_json AS snapshotJson,
      effective_at AS effectiveAt,review_reason AS reviewReason,created_at AS createdAt
      FROM seller_route_transition_applications WHERE seller_id=?
      ORDER BY created_at DESC,id`).bind(sellerId).all<RouteTransitionSummary & {snapshotJson:string|null}>(),
  ]);
  return {
    participationRoute: participation?.participationRoute ?? null,
    applicationStage: participation?.applicationStage ?? null,
    commercialModel: participation?.commercialModel ?? null,
    products: products.results,
    supplies: supplies.results,
    transitions: transitions.results.map(({snapshotJson,...row})=>{
      try {
        const terms=JSON.parse(snapshotJson??'null') as NonNullable<RouteTransitionSummary['acceptedTerms']>|null;
        if(!terms||!Number.isSafeInteger(terms.commissionBps)||typeof terms.document!=='string'||!Array.isArray(terms.evidence))return {...row,acceptedTerms:null};
        return {...row,acceptedTerms:{commissionBps:terms.commissionBps,agreementVersion:terms.agreementVersion,language:terms.language,acceptedAt:terms.acceptedAt,
          document:terms.document,evidence:terms.evidence.map(item=>({id:item.id,kind:item.kind}))}};
      }catch{return {...row,acceptedTerms:null};}
    }),
  };
}
