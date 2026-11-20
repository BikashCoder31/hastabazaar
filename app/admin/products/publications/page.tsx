import { env } from 'cloudflare:workers';
import { PublishingSelection } from '../intakes/catalog-selection';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import { getProductPublicationReview } from '@/lib/products/publication';
import { listReviewTasks } from '@/lib/workflows/review-tasks';
import { CatalogQueue } from '../intakes/catalog-queue';
import {
  listApprovedPublications,
  listHelpRequests,
  publishingQueuePath,
} from '../intakes/catalog-queue-data';

export const dynamic = 'force-dynamic';

export default async function ProductPublicationQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage(publishingQueuePath, 'product.publish');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [query, permittedTasks] = await Promise.all([
    searchParams,
    listReviewTasks(db, staff.id),
  ]);
  const intakeTasks = permittedTasks.filter((task) =>
    task.sourceType.startsWith('product_intake_'),
  );
  const tasks = intakeTasks.filter(
    (task) =>
      task.sourceType === 'product_intake_review' &&
      ['ready_for_decision', 'resolved'].includes(task.sourceStatus),
  );
  const [rows, helpRequests] = await Promise.all([
    listApprovedPublications(db, tasks),
    can(staff, 'product.review') || can(staff, 'support.manage')
      ? listHelpRequests(db, intakeTasks)
      : undefined,
  ]);
  const selected = rows.find((row) => row.id === query?.case) ?? rows[0];
  const work = selected
    ? await getProductPublicationReview(db, staff.id, selected.id)
    : null;

  return (
    <CatalogQueue
      view="publishing"
      rows={rows}
      counts={{ help: helpRequests?.length, publishing: rows.length }}
      selected={selected?.id}
      actorId={staff.id}
      tasks={tasks}
      historyOpen={Object.keys(query ?? {}).some((key) =>
        key.startsWith('review'),
      )}
    >
      {work && selected && (
        <PublishingSelection
          key={selected.id}
          caseId={selected.id}
          actorId={staff.id}
          initial={work}
          approval={{
            title: selected.title,
            sellerName: selected.sellerName,
            photoId: selected.photoId,
            approvedAt: selected.at,
            pricePaisa: selected.pricePaisa,
            hasPreviousVersion: selected.hasPreviousVersion,
          }}
        />
      )}
    </CatalogQueue>
  );
}
