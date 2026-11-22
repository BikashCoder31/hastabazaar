import { env } from 'cloudflare:workers';

import { CustomerSettings } from '@/components/account/account-sections';
import { AddressManager } from '@/components/account/address-manager';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerAddresses, listDeletedCustomerAddressAnswerOwnersPage } from '@/lib/db/repositories/customers';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';

export const dynamic = 'force-dynamic';

export default async function AddressesPage({ searchParams }: {
  searchParams?: Promise<{ addressId?: string; historyAt?: string; historyId?: string;
    deletedAt?: string; deletedId?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/account/addresses');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const params = await searchParams;
  const at = params?.historyAt ? Number(params.historyAt) : NaN;
  const after = Number.isSafeInteger(at) && at >= 0 && params?.historyId && params.historyId.length <= 191
    ? { createdAt: at, id: params.historyId } : undefined;
  const deletedAt = params?.deletedAt ? Number(params.deletedAt) : NaN;
  const deletedAfter = Number.isSafeInteger(deletedAt) && deletedAt >= 0 && params?.deletedId && params.deletedId.length <= 191
    ? { deletedAt, addressId: params.deletedId } : undefined;
  const [addresses, deleted] = await Promise.all([
    listCustomerAddresses(db, customer.userId),
    listDeletedCustomerAddressAnswerOwnersPage(db, { userId: customer.userId, after: deletedAfter }),
  ]);
  const history = await Promise.all([
    ...addresses.map((address) => ({ id: address.id, label: address.label })),
    ...deleted.addresses.map((address) => ({ id: address.addressId, label: 'Deleted address' })),
  ].map(async (address) => ({ address,
    page: await listFormAnswersForSubjectPage(db, { subjectType: 'address', subjectId: address.id,
      formId: 'account.address', after: params?.addressId === address.id ? after : undefined }),
  })));
  return <CustomerSettings active="addresses">
    <AddressManager actorId={customer.userId} addresses={addresses} embedded />
    {history.filter(({ page }) => page.answers.length).map(({ address, page }) => <section key={address.id}
      className="mt-6 space-y-4" aria-label={`${address.label} address answer history`}>
      <h2 className="font-heading text-2xl">{address.label} · previous address answers</h2>
      {page.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
      {page.nextCursor ? <a className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium" href={
        `/account/addresses?addressId=${encodeURIComponent(address.id)}&historyAt=${page.nextCursor.createdAt}&historyId=${encodeURIComponent(page.nextCursor.id)}` +
        (deletedAfter ? `&deletedAt=${deletedAfter.deletedAt}&deletedId=${encodeURIComponent(deletedAfter.addressId)}` : '')
      }>Next 50 answers</a> : null}
    </section>)}
    {deleted.nextCursor ? <a className="mt-6 inline-flex rounded-lg border px-4 py-2 text-sm font-medium" href={
      `/account/addresses?deletedAt=${deleted.nextCursor.deletedAt}&deletedId=${encodeURIComponent(deleted.nextCursor.addressId)}`
    }>Next 50 deleted addresses</a> : null}
  </CustomerSettings>;
}
