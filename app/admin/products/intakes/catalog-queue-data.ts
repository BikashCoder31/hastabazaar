import { detailText } from '@/lib/products/category-fields';
import type { IntakeSnapshot } from '@/lib/products/intake-workspace';
import type { ProductPublication } from '@/lib/products/publication-contract';
import type { listReviewTasks } from '@/lib/workflows/review-tasks';
import { describeRetainedHelp } from './retained-help';

export type ReviewTask = Awaited<ReturnType<typeof listReviewTasks>>[number];

export interface CatalogQueueRow {
  id: string;
  title: string;
  sellerName: string;
  photoId?: string;
  at: number;
  missing?: number;
  waitingForSeller?: boolean;
}

interface IntakeRow {
  id: string;
  state: string;
  snapshot: string;
  received: string | null;
  receivedAt: number | null;
  firstRequestedAt: number;
}

interface PublishingRow {
  id: string;
  approvedAt: number;
  approvedFacts: string;
  previousVersionId: string | null;
}

export const helpQueuePath = '/admin/products/intakes';
export const publishingQueuePath = '/admin/products/publications';

export async function listHelpRequests(
  db: D1Database,
  tasks: ReviewTask[],
): Promise<CatalogQueueRow[]> {
  const current = new Map(
    tasks
      .filter(
        (task) =>
          task.sourceStatus !== 'resolved' &&
          task.sourceStatus !== 'ready_for_decision',
      )
      .map((task) => [task.sourceId, task]),
  );
  const ids = [...current.keys()];
  const rows: CatalogQueueRow[] = [];
  for (let start = 0; start < ids.length; start += 90) {
    const page = ids.slice(start, start + 90);
    const result = await db
      .prepare(`
      SELECT c.id, c.state, v.snapshot_json AS snapshot, e.detail_json AS received,
             e.created_at AS receivedAt, c.first_requested_at AS firstRequestedAt
      FROM product_intake_cases c
      JOIN product_intake_workspace_versions v ON v.id = c.version_id AND v.draft_id = c.draft_id
      LEFT JOIN product_intake_events e ON e.id = (
        SELECT latest.id FROM product_intake_events latest
        WHERE latest.case_id = c.id AND latest.version_id = c.version_id AND latest.kind = 'received'
        ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
      )
      WHERE c.id IN (${page.map(() => '?').join(',')})
    `)
      .bind(...page)
      .all<IntakeRow>();
    for (const row of result.results) {
      const task = current.get(row.id);
      if (!task || task.sourceStatus !== row.state) continue;
      const help = describeRetainedHelp(
        row.received ? JSON.parse(row.received) : undefined,
      );
      if (!help.requested && task.sourceType !== 'product_intake_help')
        continue;
      const snapshot = JSON.parse(row.snapshot) as IntakeSnapshot;
      rows.push({
        id: row.id,
        title: task.recordTitle ?? 'Incomplete product information',
        sellerName: task.sellerName ?? 'Seller',
        photoId: snapshot.mediaIds[0],
        at: row.receivedAt ?? row.firstRequestedAt,
        missing: help.issues.filter(
          (issue) => issue.code === 'missing' || issue.field === 'categoryId',
        ).length,
        waitingForSeller: task.nextActor === 'Seller',
      });
    }
  }
  return rows.sort(
    (a, b) =>
      Number(a.waitingForSeller) - Number(b.waitingForSeller) || b.at - a.at,
  );
}

export async function listApprovedPublications(
  db: D1Database,
  tasks: ReviewTask[],
) {
  const pending = new Map(
    tasks
      .filter(
        (task) =>
          task.sourceType === 'product_intake_review' &&
          task.sourceStatus === 'ready_for_decision',
      )
      .map((task) => [task.sourceId, task]),
  );
  const ids = [...pending.keys()];
  const rows: Array<
    CatalogQueueRow & { pricePaisa: number; hasPreviousVersion: boolean }
  > = [];
  for (let start = 0; start < ids.length; start += 90) {
    const page = ids.slice(start, start + 90);
    const result = await db
      .prepare(`
      SELECT c.id, approval.created_at AS approvedAt, approval.public_json AS approvedFacts,
             candidate.base_version_id AS previousVersionId
      FROM product_intake_cases c
      JOIN product_publication_candidates candidate ON candidate.case_id = c.id AND candidate.workspace_version_id = c.version_id
      JOIN product_publication_heads h ON h.product_id = candidate.product_id AND h.pending_version_id = candidate.id
      JOIN product_publication_decisions approval ON approval.id = h.approved_decision_id
        AND approval.version_id = candidate.id AND approval.action = 'approve_only'
      WHERE c.state = 'ready_for_decision' AND c.id IN (${page.map(() => '?').join(',')})
    `)
      .bind(...page)
      .all<PublishingRow>();
    for (const row of result.results) {
      const task = pending.get(row.id);
      if (!task) continue;
      const approved = JSON.parse(row.approvedFacts) as ProductPublication;
      rows.push({
        id: row.id,
        title:
          detailText(approved.details, 'nameEn') ||
          task.recordTitle ||
          'Product',
        sellerName: task.sellerName ?? 'Seller',
        photoId: approved.coverMediaId,
        at: row.approvedAt,
        pricePaisa: approved.pricePaisa,
        hasPreviousVersion: row.previousVersionId !== null,
      });
    }
  }
  return rows.sort((a, b) => b.at - a.at);
}
