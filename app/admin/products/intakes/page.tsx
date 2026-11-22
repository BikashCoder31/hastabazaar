import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { HelpSelection } from './catalog-selection';
import { requireStaffPage } from '@/lib/auth/staff';
import { listActiveCategories } from '@/lib/db/repositories/products';
import { requireDatabase } from '@/lib/db/d1';
import { can } from '@/lib/marketplace/permissions';
import { getProductIntakeReview } from '@/lib/products/intake-assistance';
import { listReviewTasks } from '@/lib/workflows/review-tasks';
import { CatalogQueue } from './catalog-queue';
import {
  helpQueuePath,
  listApprovedPublications,
  listHelpRequests,
} from './catalog-queue-data';

export const dynamic = 'force-dynamic';

export default async function ProductAssistanceQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaffPage(helpQueuePath);
  if (!can(staff, 'product.review') && !can(staff, 'support.manage'))
    redirect('/staff-access-denied');

  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [query, permittedTasks] = await Promise.all([
    searchParams,
    listReviewTasks(db, staff.id),
  ]);
  const tasks = permittedTasks.filter((task) =>
    task.sourceType.startsWith('product_intake_'),
  );
  const [rows, publications] = await Promise.all([
    listHelpRequests(db, tasks),
    can(staff, 'product.publish')
      ? listApprovedPublications(db, tasks)
      : undefined,
  ]);
  const selected = rows.find((row) => row.id === query?.case) ?? rows[0];
  const [work, categories] = selected
    ? await Promise.all([
        getProductIntakeReview(db, staff.id, selected.id),
        listActiveCategories(db),
      ])
    : [null, []];

  return (
    <CatalogQueue
      view="help"
      rows={rows}
      counts={{ help: rows.length, publishing: publications?.length }}
      selected={selected?.id}
      actorId={staff.id}
      tasks={tasks}
      historyOpen={Object.keys(query ?? {}).some((key) =>
        key.startsWith('review'),
      )}
    >
      {work && selected && (
        <HelpSelection
          key={work.id}
          initial={work}
          category={work.categoryModel}
          categories={categories}
          sellerName={selected.sellerName}
        />
      )}
    </CatalogQueue>
  );
}
