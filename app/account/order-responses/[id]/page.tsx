import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCustomerUser } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { readPreparationWorkspace } from '@/lib/orders/response-workspace';
import { readCustomerDelayQuestions } from '@/lib/orders/customer-delay-answer';
import { CustomerPreparationQuestion } from '@/components/commerce/customer-preparation-question';
import { OrderPreparationWorkspace } from '@/components/commerce/order-preparation-workspace';

export const dynamic = 'force-dynamic';

export default async function PreparationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, getCustomerUser()]);
  if (!viewer) notFound();
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const workspace = await readPreparationWorkspace(database, viewer.userId, id, 'customer', { actorAuthSubject: viewer.authSubject });
  if (!workspace) notFound();
  const allQuestions = await readCustomerDelayQuestions(database, { id: viewer.userId, authSubject: viewer.authSubject },
    { orderId: workspace.orderId, includeAnswered: true });
  const questions = allQuestions.some(question => question.id === id)
    ? allQuestions.filter(question => question.id === id) : allQuestions;

  return (
    <div className="min-w-0 space-y-5">
      <Link href={`/orders/${encodeURIComponent(workspace.orderNumber)}`} className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-[#A8232E] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]">Back to order {workspace.orderNumber}</Link>
      <h1 className="font-heading text-4xl tracking-tight">Seller updates</h1>
      {questions.map(question => (
        <CustomerPreparationQuestion key={question.id} question={question} actorId={viewer.userId} />
      ))}
      <OrderPreparationWorkspace workspace={workspace} />
    </div>
  );
}
