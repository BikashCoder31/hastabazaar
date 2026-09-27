import { env } from 'cloudflare:workers';

import { AddressManager } from '@/components/account/address-manager';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerAddresses } from '@/lib/db/repositories/customers';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';

export const dynamic = 'force-dynamic';

export default async function AddressesPage({ searchParams }: {
  searchParams?: Promise<{ addressId?: string; historyAt?: string; historyId?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/account/addresses');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const addresses = await listCustomerAddresses(
    db,
    customer.userId,
  );
  const params = await searchParams;
  const at = params?.historyAt ? Number(params.historyAt) : NaN;
  const after = Number.isSafeInteger(at) && at >= 0 && params?.historyId && params.historyId.length <= 191
    ? { createdAt: at, id: params.historyId } : undefined;
  const history = await Promise.all(addresses.map(async (address) => ({ address,
    page: await listFormAnswersForSubjectPage(db, { subjectType: 'address', subjectId: address.id,
      formId: 'account.address', after: params?.addressId === address.id ? after : undefined }),
  })));
  return <>
    <AddressManager addresses={addresses} />
    {history.filter(({ page }) => page.answers.length).map(({ address, page }) => <section key={address.id}
      className="mt-6 space-y-4" aria-label={`${address.label} address answer history`}>
      <h2 className="font-heading text-2xl">{address.label} · previous address answers</h2>
      {page.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {page.nextCursor ? <a className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium" href={
        `/account/addresses?addressId=${encodeURIComponent(address.id)}&historyAt=${page.nextCursor.createdAt}&historyId=${encodeURIComponent(page.nextCursor.id)}`
      }>Next 50 answers</a> : null}
    </section>)}
  </>;
}
