import Link from 'next/link';
import { headers } from 'next/headers';
import { AdminPageTitle } from '@/components/admin/page-help';
import { requireStaffPage } from '@/lib/auth/staff';
import { emailPreviewGroups, renderEmailPreview } from '@/lib/email/preview-fixtures';

const path = '/admin/business-emails/preview';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email template previews', robots: { index: false, follow: false } };

export default async function BusinessEmailPreviewPage({
  searchParams,
}: { searchParams?: Promise<{ template?: string }> }) {
  await requireStaffPage(path, 'email.delivery.manage');
  const { template } = await searchParams ?? {};
  const choices = emailPreviewGroups.flatMap(group => [...group.entries]);
  const selected = choices.find(choice => choice.id === template) ?? choices[0];
  const host = (await headers()).get('host');
  const local = host === 'localhost:3018' || host === '127.0.0.1:3018';
  const origin = local ? 'http://' + host : 'https://hastabazaar.com';
  const message = renderEmailPreview(selected, origin, local);

  return (
    <div className="min-w-0 space-y-4 text-[#14213D]">
      <Link href="/admin/business-emails" className="inline-flex min-h-11 items-center rounded-lg font-semibold text-[#A8232E] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]">
        ← Email delivery
      </Link>
      <AdminPageTitle><h1 className="font-heading text-3xl sm:text-4xl">Email templates</h1></AdminPageTitle>
      <p className="text-sm text-[#465573]">Review each email with fictional order and seller details.</p>
      <div className="grid min-w-0 items-start gap-5 rounded-2xl bg-[#EFE8DC] p-3 sm:p-5 md:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)] xl:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)_minmax(9rem,12rem)]">
        <nav aria-label="Email templates" className="flex min-w-0 gap-2 overflow-x-auto pb-2 md:flex-col md:gap-4 md:overflow-visible md:pb-0">
          {emailPreviewGroups.map(group => (
            <div key={group.label} className="flex shrink-0 gap-2 md:block">
              <p className="hidden px-3 pb-2 text-xs font-semibold text-[#584D40] md:block">{group.label}</p>
              {group.entries.map(choice => {
                const active = choice.id === selected.id;
                return (
                  <Link key={choice.id} href={path + '?template=' + choice.id} aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 min-w-0 shrink-0 items-center rounded-xl border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#14213D] md:mb-1 ${active ? 'border-[#D7C7AB] bg-white font-semibold' : 'border-transparent text-[#465573] hover:bg-[#F7F3EC]'}`}>
                    {choice.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <article aria-label="Email preview" className="min-w-0 overflow-hidden rounded-2xl border border-[#E4DACA] bg-[#F7F3EC] shadow-md">
          <header className="space-y-1 border-b border-[#E4DACA] bg-white p-4 [overflow-wrap:anywhere]">
            <p className="text-xs text-[#465573]">From Hastabazaar · To {message.to}</p>
            <p data-email-subject className="font-bold leading-snug">{message.subject}</p>
            <p className="text-sm text-[#584D40]">{message.preheader}</p>
          </header>
          <div className="min-w-0 px-2 sm:px-4" dangerouslySetInnerHTML={{ __html: message.markup }} />
        </article>
        <aside aria-label="About this email" className="grid min-w-0 gap-3 md:col-span-2 xl:col-span-1">
          <section className="rounded-2xl border border-[#E4DACA] bg-[#FFFCF7] p-4">
            <h2 className="text-sm font-semibold">When it’s sent</h2>
            <p className="mt-1 text-sm text-[#465573]">{selected.when}</p>
          </section>
          <section className="rounded-2xl border border-[#E4DACA] bg-[#FFFCF7] p-4">
            <h2 className="text-sm font-semibold">Who acts next</h2>
            <p className="mt-1 text-sm text-[#465573]">{selected.next}</p>
          </section>
          <section className="rounded-2xl border border-[#E4DACA] bg-[#FFFCF7] p-4">
            <h2 className="text-sm font-semibold">Rules for every email</h2>
            <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-[#465573]">
              <li>One clear button opens the exact page.</li>
              <li>Amounts and dates come from the saved record.</li>
              <li>In-app notifications use the same event.</li>
              <li>Seller emails include English and Nepali.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
