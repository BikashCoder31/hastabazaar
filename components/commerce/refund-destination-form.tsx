'use client';

import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { useRef, type SyntheticEvent } from 'react';
import { useCaseCommand } from '@/components/admin/use-case-command';
import type { getCustomerRefundWorkspace } from '@/lib/payments/refund-workspace';
import { FinanceEvidenceUpload } from './finance-evidence-upload';
import { aftercareLink, aftercarePrimary, aftercareSecondary } from './customer-request-presentation';

type Row = Awaited<ReturnType<typeof getCustomerRefundWorkspace>>[number];
const field = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-[#CFBB9E] bg-white px-3 py-2 font-normal text-[#14213D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';

export function RefundDestinationForm({ row, actorId }: { row: Row; actorId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const command = useCaseCommand('system.refund-destination', actorId, 'destination', row.id,
    '/api/account/refunds?obligation=' + encodeURIComponent(row.id), { created: true });
  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (!ref.current) return;
    const data = new FormData(ref.current);
    await command.submit({
      sourceFormId: 'system.refund-destination', expectedRevision: row.destination ? String(row.destination.revision) : null,
      obligationId: row.id, details: { holder: data.get('holder'), bank: data.get('bank'), branch: data.get('branch'),
        accountNumber: data.get('accountNumber'), currency: 'NPR' }, relationship: data.get('relationship'),
      authorization: data.get('authorization'), evidenceReference: data.get('evidenceReference'), reason: data.get('reason'),
    });
  }

  return <section className="min-w-0 space-y-4 rounded-xl border border-[#E7DCCB] bg-white p-4 text-sm text-[#46536F] sm:p-5" aria-label="Private refund bank details">
    <h4 className="flex items-center gap-2 text-base font-semibold text-[#14213D]">
      <LockKeyhole className="size-4 shrink-0" aria-hidden="true"/> Where should the refund go?
    </h4>
    <p className="break-words">{row.destination ? `Current instructions: ${row.destination.label} · ${row.destination.status.replaceAll('_', ' ')}`
      : 'Provide the bank account to receive this approved cash refund. We’ll verify it before sending any money.'}</p>
    <p className="leading-relaxed">Use your own account or the verified original payer’s account. A nominated recipient needs your explicit permission and extra verification. Keep passwords, PINs and one-time codes private.</p>
    <Link className={aftercareLink} href="/login?reauth=1&return_to=%2Faccount%2Frefunds">Sign in again if requested</Link>
    {command.saved ? <div className="flex flex-wrap gap-2">
      <button type="button" className={aftercareSecondary} disabled={command.busy} onClick={() => void command.recover()}>Check saved instructions</button>
      {command.canRetry ? <button type="button" className={aftercareSecondary} disabled={command.busy} onClick={() => void command.retry()}>Retry unchanged instructions</button> : null}
      {command.unrecorded ? <button type="button" className={aftercareSecondary} disabled={command.busy} onClick={command.restart}>Review and start a new attempt</button> : null}
    </div> : null}
    <div className="[&_button]:min-h-11 [&_input]:min-h-11 [&_input]:max-w-full">
      <FinanceEvidenceUpload actorId={actorId} mode="customer" scope={{ kind: 'obligation', id: row.id }}
        files={row.evidenceFiles} onSaved={id => {
          const input = ref.current?.elements.namedItem('evidenceReference');
          if (input instanceof HTMLInputElement) input.value = id;
        }}/>
    </div>
    <form ref={ref} data-form-id="system.refund-destination" aria-label="Private refund destination" onSubmit={submit}>
      <fieldset disabled={command.busy || command.saved} className="grid min-w-0 gap-3 sm:grid-cols-2">
        {[['holder', 'Exact account holder'], ['bank', 'Bank'], ['branch', 'Branch'], ['accountNumber', 'Account number'],
          ['evidenceReference', 'Protected account-holder evidence reference']].map(([name, label]) =>
          <label className="min-w-0 font-medium text-[#14213D]" key={name}>{label}
            <input name={name} required autoComplete="off" inputMode={name === 'accountNumber' ? 'numeric' : undefined} className={field}/>
          </label>)}
        <label className="min-w-0 font-medium text-[#14213D]">Payment relationship
          <select name="relationship" className={field}>
            <option value="own_account">My own account</option><option value="original_payer">Verified original payer</option>
            <option value="authorized_nominee">Specifically authorized nominated recipient</option>
          </select>
        </label>
        <label className="min-w-0 font-medium text-[#14213D] sm:col-span-2">My explicit authorization naming this recipient and account
          <textarea name="authorization" required minLength={20} maxLength={2000} className={`${field} min-h-20 resize-y`}/>
        </label>
        <label className="min-w-0 font-medium text-[#14213D] sm:col-span-2">Reason and any nominated-recipient relationship
          <textarea name="reason" required minLength={10} maxLength={1500} className={`${field} min-h-20 resize-y`}/>
        </label>
        <button className={`${aftercarePrimary} justify-self-start sm:col-span-2`} type="submit">Save private instructions for verification</button>
      </fieldset>
    </form>
    {command.message ? <output className="block break-words" aria-live="polite">{command.message}</output> : null}
  </section>;
}
