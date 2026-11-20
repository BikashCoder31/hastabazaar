export const problemFilters = [
  ['all', 'All'],
  ['delay', 'Seller delays'],
  ['cannot_fulfill', 'Can’t fulfil'],
  ['delivery_failed', 'Delivery failed'],
  ['refused', 'Refused'],
  ['return_to_origin', 'Coming back'],
] as const;

export type ProblemFilter = (typeof problemFilters)[number][0];
export type ProblemKind = Exclude<ProblemFilter, 'all'>;

export type ParcelProblem = {
  id: string;
  kind: ProblemKind;
  source: 'preparation' | 'job' | 'shipment' | 'refusal';
  sourceId: string;
  orderId: string;
  orderNumber: string;
  sellerName: string | null;
  state: string;
  occurredAt: number;
  readyAt: number | null;
  nextUpdateAt: number | null;
  trackingCode: string | null;
  courierName: string | null;
  note: string | null;
  followup: string | null;
  version: number | null;
};

const pageSize = 25;

export function readProblemFilter(value: string | undefined): ProblemFilter {
  return problemFilters.find(([key]) => key === value)?.[0] ?? 'all';
}

export function problemHref(kind: ProblemFilter, page = 1, id?: string) {
  const params = new URLSearchParams();
  if (kind !== 'all') params.set('kind', kind);
  if (page > 1) params.set('page', String(page));
  if (id) params.set('problem', id);
  return `/admin/shipping${params.size ? `?${params}` : ''}`;
}

export async function readParcelProblems(
  db: D1Database,
  { superAdmin, kind, requestedPage }: { superAdmin: boolean; kind: ProblemFilter; requestedPage: string | undefined },
) {
  const refusalOutcomes = "('refused_whole_parcel_wrong_item','refused_whole_parcel_damage','refused_whole_parcel_other')";
  const activeRefusals = superAdmin ? `SELECT r.id,r.shipping_job_id,r.open_box_outcome,r.note,r.created_at
    FROM rider_reports r JOIN shipping_jobs job ON job.id=r.shipping_job_id
    WHERE r.open_box_outcome IN ${refusalOutcomes}
      AND ((r.status='pending' AND job.status='dispatched') OR (r.status='accepted' AND job.status='delivery_failed'))` :
    'SELECT NULL AS id,NULL AS shipping_job_id,NULL AS open_box_outcome,NULL AS note,NULL AS created_at WHERE 1=0';
  const queue = `WITH refusals AS (${activeRefusals}), problems AS (
    SELECT CONCAT('case:',c.id) AS id,c.kind,'preparation' AS source,c.id AS sourceId,
      o.id AS orderId,o.order_number AS orderNumber,s.trading_name AS sellerName,c.state,
      COALESCE(e.created_at,c.created_at) AS occurredAt,c.proposed_ready_at AS readyAt,c.next_update_at AS nextUpdateAt,
      NULL AS trackingCode,NULL AS courierName,NULL AS note,NULL AS followup,NULL AS version
    FROM order_response_cases c JOIN order_response_portions p ON p.id=c.portion_id
    JOIN orders o ON o.id=p.order_id JOIN seller_profiles s ON s.id=p.seller_id
    LEFT JOIN order_response_events e ON e.id=c.last_event_id
    WHERE c.state IN ('open','waiting') AND (c.kind='cannot_fulfill' OR (c.kind='delay' AND c.proposed_ready_at IS NOT NULL))
      ${superAdmin ? '' : "AND p.operator_mode='seller'"}
    UNION ALL
    SELECT CONCAT('job:',j.id),CASE WHEN j.status='delivery_failed' THEN 'delivery_failed' ELSE 'return_to_origin' END,
      'job',j.id,o.id,o.order_number,s.trading_name,j.status,j.updated_at,NULL,NULL,j.tracking_code,p.courier_name,
      (SELECT e.note FROM parcel_operation_events e WHERE e.shipping_job_id=j.id
        AND e.action=CASE WHEN j.status='delivery_failed' THEN 'fail' ELSE 'return_to_origin' END
        ${superAdmin ? '' : `AND json_extract(CASE WHEN json_valid(e.payload_json) THEN e.payload_json ELSE '{}' END,'$.riderReportId') IS NULL`}
        ORDER BY e.created_at DESC,e.id DESC LIMIT 1),
      (SELECT w.next_action FROM exception_work_items w WHERE w.shipping_job_id=j.id AND w.status='open'
        AND w.kind IN ('failed_delivery','customer_unavailable')
        ${superAdmin ? '' : `AND NOT EXISTS(SELECT 1 FROM exception_work_events x WHERE x.work_id=w.id
          AND (x.action LIKE 'rider_%' OR json_extract(CASE WHEN json_valid(x.payload_json) THEN x.payload_json ELSE '{}' END,'$.riderReportId') IS NOT NULL))`}
        ORDER BY w.updated_at DESC,w.id DESC LIMIT 1),
      CASE WHEN (p.method IS NULL OR p.method<>'own_rider') AND p.rider_user_id IS NULL
        AND o.status IN ('confirmed','packing','ready_for_pickup','dispatched','delivered')
        AND NOT EXISTS(SELECT 1 FROM first_cod_reviews review WHERE review.order_id=o.id AND review.status='pending')
        THEN p.version END
    FROM shipping_jobs j JOIN orders o ON o.id=j.order_id JOIN seller_profiles s ON s.id=j.seller_id
    LEFT JOIN shipping_parcels p ON p.shipping_job_id=j.id
    WHERE j.direction='outbound' AND j.status IN ('delivery_failed','returning','return_to_origin')
      AND (j.status<>'delivery_failed' OR NOT EXISTS(SELECT 1 FROM refusals r WHERE r.shipping_job_id=j.id))
      ${superAdmin ? '' : "AND (p.shipping_job_id IS NULL OR ((p.method IS NULL OR p.method<>'own_rider') AND p.rider_user_id IS NULL))"}
    UNION ALL
    SELECT CONCAT('shipment:',ship.id),ship.status,'shipment',ship.id,o.id,o.order_number,NULL,ship.status,
      ship.updated_at,NULL,NULL,ship.tracking_code,NULL,NULL,NULL,NULL
    FROM shipments ship JOIN orders o ON o.id=ship.order_id
    WHERE ship.status IN ('delivery_failed','return_to_origin')
      AND NOT EXISTS(SELECT 1 FROM shipments newer WHERE newer.order_id=ship.order_id
        AND (newer.updated_at>ship.updated_at OR (newer.updated_at=ship.updated_at AND newer.id>ship.id)))
      AND NOT EXISTS(SELECT 1 FROM shipping_jobs j WHERE j.order_id=ship.order_id AND j.direction='outbound')
      ${superAdmin ? '' : "AND NOT EXISTS(SELECT 1 FROM delivery_assignments d WHERE d.order_id=ship.order_id AND (d.method='own_rider' OR d.rider_user_id IS NOT NULL))"}
    ${superAdmin ? `UNION ALL
    SELECT CONCAT('refusal:',r.id),'refused','refusal',r.id,o.id,o.order_number,s.trading_name,r.open_box_outcome,
      r.created_at,NULL,NULL,NULL,NULL,r.note,NULL,NULL
    FROM refusals r JOIN shipping_jobs j ON j.id=r.shipping_job_id JOIN orders o ON o.id=j.order_id
    JOIN seller_profiles s ON s.id=j.seller_id
    WHERE NOT EXISTS(SELECT 1 FROM refusals newer WHERE newer.shipping_job_id=r.shipping_job_id
      AND (newer.created_at>r.created_at OR (newer.created_at=r.created_at AND newer.id>r.id)))` : ''}
  )`;
  const counts = (await db.prepare(`${queue} SELECT kind,COUNT(*) AS total FROM problems GROUP BY kind`)
    .all<{ kind: ProblemKind; total: number }>()).results;
  const countByKind = new Map<ProblemFilter, number>(counts.map(({ kind, total }) => [kind, Number(total)]));
  countByKind.set('all', counts.reduce((sum, entry) => sum + Number(entry.total), 0));
  const pageCount = Math.max(1, Math.ceil((countByKind.get(kind) ?? 0) / pageSize));
  const requested = Number(requestedPage);
  const page = Number.isSafeInteger(requested) ? Math.min(Math.max(1, requested), pageCount) : 1;
  const { results } = await db.prepare(`${queue} SELECT * FROM problems WHERE (?='all' OR kind=?)
    ORDER BY occurredAt DESC,id DESC LIMIT ? OFFSET ?`).bind(kind, kind, pageSize, (page - 1) * pageSize).all<ParcelProblem>();
  return { countByKind, page, pageCount, problems: results };
}
