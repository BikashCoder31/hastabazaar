'use client';

import { Clock3, Plus, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition, type SyntheticEvent } from 'react';
import type { NcmSettingsView } from '@/lib/delivery/ncm-settings';
import type { DeliveryPartner } from '@/lib/delivery/partners';
import { deliveryPartnerStatuses, type DeliveryPartnerStatus } from '@/lib/delivery/partner-status';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { NcmSettings } from './ncm-settings';

const panel = 'min-w-0 rounded-xl border border-[#E2D6C2] bg-white';
const control = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-[#D7C4A9] px-3 text-sm font-semibold hover:bg-[#F7F3EC] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const field = 'min-h-11 w-full min-w-0 rounded-lg border border-[#D7C4A9] bg-white px-3 text-base font-normal';
const tones: Record<DeliveryPartnerStatus, string> = {
  in_use: 'bg-[#DFECE4] text-[#21553E]', setting_up: 'bg-[#F7E9C5] text-[#69430A]', not_in_use: 'bg-[#F3ECDF] text-[#46536F]',
};

type SaveInput = {
  id: string; name: string; status: DeliveryPartnerStatus; collectsCod: boolean;
  bookingMode: DeliveryPartner['bookingMode']; trackingPattern: string;
  makeDefault: boolean; expectedRevision: number | null;
};

function personalName(name: string) {
  const known = name.trim().toLowerCase();
  return known === 'upaya' ? 'upaya' : known === 'nepal can move' ? 'ncm' : null;
}

function PartnerCard({ partner, hasNcmSettings, connected, busy, onEdit, onMakeDefault }: {
  partner: DeliveryPartner; hasNcmSettings: boolean; connected: boolean;
  busy: boolean; onEdit: () => void; onMakeDefault: () => void;
}) {
  const profile = personalName(partner.name);
  const starter = profile === 'upaya' ? 'UP' : profile === 'ncm' ? 'NCM' : partner.name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();
  const status = deliveryPartnerStatuses.find(option => option.value === partner.status)?.label;
  const byApi = partner.bookingMode === 'api';
  const label = byApi ? 'API' : partner.status === 'in_use' || profile === 'upaya' ? 'By hand' : 'By hand for now';
  const apiDetails = connected ? 'Book with Nepal Can Move from Dispatch. Book by hand remains available.'
    : 'Choose Book by hand in Dispatch while the NCM connection is unavailable.';
  const rows = [
    ['Booking', <><strong>{label}</strong><p className="text-sm text-[#46536F]">{byApi
      ? apiDetails
      : <>Book on {partner.name}’s website or by phone, then record the number in Dispatch.</>}</p></>],
    ['Cash on delivery', partner.collectsCod ? 'Collects cash from the customer' : 'Does not collect cash from the customer'],
    ['Cash settlement', partner.collectsCod ? 'Record each statement in Money › Courier cash.' : 'No courier cash to match.'],
    ['Parcels this month', new Intl.NumberFormat('en-NP').format(partner.parcelsThisMonth)],
  ] as const;
  return <section className={panel} aria-labelledby={'delivery-partner-' + partner.id}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2D6C2] px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className={'grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white ' +
          (profile === 'ncm' ? 'bg-[#A8232E]' : 'bg-[#29477D]')}>{starter}</span>
        <h2 id={'delivery-partner-' + partner.id} className="wrap-anywhere text-lg font-bold">{partner.name}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={'rounded-full px-2 py-1 text-xs font-semibold ' + tones[partner.status]}>{status}</span>
        {partner.isDefault ? <span className="rounded-full bg-[#14213D] px-2 py-1 text-xs font-semibold text-white">Default for new bookings</span>
          : partner.status === 'in_use' && partner.bookingMode === 'manual' && <button type="button" className={control} disabled={busy} onClick={onMakeDefault}>Make default</button>}
        <button type="button" className={control} disabled={busy} onClick={onEdit} aria-label={'Edit ' + partner.name}>Edit</button>
      </div>
    </header>
    <div className="grid min-w-0 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <dl className="grid gap-3 p-4 sm:p-5">
        {rows.map(([row, content]) => <div key={row} className="grid gap-1 xl:grid-cols-[minmax(7rem,0.75fr)_minmax(0,1.25fr)]">
          <dt className="text-sm text-[#46536F]">{row}</dt>
          <dd className="min-w-0 wrap-anywhere text-sm">{content}</dd>
        </div>)}
      </dl>
      <div className="min-w-0 space-y-3 border-t border-[#E2D6C2] p-4 sm:p-5 xl:border-s xl:border-t-0">
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-sm font-semibold">Customer tracking link</h3>
          <p className="min-h-11 rounded-lg border border-[#D7C4A9] px-3 py-2.5 text-sm wrap-anywhere text-[#46536F]">
            {partner.trackingPattern ?? 'No tracking link set'}
          </p>
          <p className="text-xs text-[#46536F]">Put <strong>{'{number}'}</strong> where the tracking number goes. Leave it empty to show the number only.</p>
        </div>
        {!hasNcmSettings && <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">API</h3>
          <p className={'flex items-start gap-2 rounded-lg p-3 text-sm ' + (profile === 'ncm' ? 'bg-[#F7E9C5] text-[#69430A]' : 'bg-[#E3E9F4] text-[#29436A]')}>
            {profile === 'ncm' ? <Settings2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            <span>{profile === 'upaya' ? <><strong>API available, not connected.</strong> Keep booking by hand on Upaya’s website.</>
              : profile === 'ncm' ? <><strong>Integration in progress.</strong> Continue using Delivery rates and manual bookings.</>
              : <strong>API not connected.</strong>}</span>
          </p>
        </div>}
      </div>
    </div>
  </section>;
}

function PartnerEditor({ id, partner, canSelectApi = false, busy, onSave, onCancel }: {
  id: string; partner?: DeliveryPartner; canSelectApi?: boolean; busy: boolean;
  onSave: (value: SaveInput) => void; onCancel: () => void;
}) {
  const fieldId = useId();
  const [status, setStatus] = useState<DeliveryPartnerStatus>(partner?.status ?? 'not_in_use');
  const [bookingMode, setBookingMode] = useState<DeliveryPartner['bookingMode']>(partner?.bookingMode ?? 'manual');
  const canMakeDefault = status === 'in_use' && bookingMode === 'manual';
  const canSave = bookingMode === 'manual' || canSelectApi;
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    const data = new FormData(event.currentTarget);
    const name = data.get('name'), trackingPattern = data.get('trackingPattern');
    if (typeof name !== 'string' || typeof trackingPattern !== 'string') return;
    onSave({ id, name, status, trackingPattern, bookingMode, collectsCod: data.has('collectsCod'),
      makeDefault: canMakeDefault && data.has('makeDefault'), expectedRevision: partner?.revision ?? null });
  }
  return <form data-form-id="staff.delivery-partner" onSubmit={submit} className={panel + ' space-y-4 p-4 sm:p-5'}>
    <h2 className="text-lg font-bold">{partner ? 'Edit ' + partner.name : 'Add a delivery partner'}</h2>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-semibold">Partner name
        <input name="name" required minLength={2} maxLength={120} defaultValue={partner?.name} className={field} />
      </label>
      <div className="grid gap-1 text-sm font-semibold">
        <label htmlFor={fieldId + '-status'}>Status</label>
        <select id={fieldId + '-status'} value={status} onChange={event => {
          const selected = deliveryPartnerStatuses.find(option => option.value === event.currentTarget.value);
          if (selected) setStatus(selected.value);
        }} className={field}>
          {deliveryPartnerStatuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="grid gap-1 text-sm font-semibold">
        <label htmlFor={fieldId + '-mode'}>Booking mode</label>
        <select id={fieldId + '-mode'} value={bookingMode} onChange={event => {
          setBookingMode(event.currentTarget.value === 'api' && canSelectApi ? 'api' : 'manual');
        }} className={field} aria-describedby={!canSave ? fieldId + '-mode-note' : undefined}>
          <option value="manual">By hand</option>
          <option value="api" disabled={!canSelectApi}>{canSelectApi ? 'API' : 'API · unavailable'}</option>
        </select>
        {!canSave && <p id={fieldId + '-mode-note'} className="text-sm font-normal text-[#46536F]">Choose By hand or reconnect Nepal Can Move before saving.</p>}
      </div>
      <label className="grid gap-1 text-sm font-semibold">Customer tracking link
        <input name="trackingPattern" maxLength={500} defaultValue={partner?.trackingPattern ?? ''} placeholder={'https://…/{number}'} className={field} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="collectsCod" defaultChecked={partner?.collectsCod ?? false} /> Collects cash on delivery
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="makeDefault" defaultChecked={partner?.isDefault ?? false} disabled={!canMakeDefault} /> Default for new bookings
      </label>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="submit" className={control + ' bg-[#14213D] text-white hover:bg-[#233758]'} disabled={busy || !canSave}>Save delivery partner</button>
      <button type="button" className={control} disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}

export function DeliveryPartners({ partners, actorId, ncm }: {
  partners: DeliveryPartner[]; actorId: string; ncm?: NcmSettingsView | null;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ id: string; existing: boolean } | null>(null);
  const [busy, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const attempt = useRef<{ hash: string; requestId: string } | null>(null);
  const editing = partners.find(partner => partner.id === editor?.id);
  const connectedNcmId = ncm?.configured && ncm.connectedAt !== null ? ncm.partnerId : null;

  function save(input: SaveInput) {
    const hash = JSON.stringify(input);
    const requestId = attempt.current?.hash === hash ? attempt.current.requestId : crypto.randomUUID();
    attempt.current = { hash, requestId };
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/delivery-partners', { method: 'POST',
          headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
          body: JSON.stringify({ ...input, requestId }) });
        const body = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || !body.ok) {
          setFeedback({ error: true, text: body.error ?? 'Check the details before trying again.' });
          return;
        }
        setFeedback({ text: 'Delivery partner saved.' });
        setEditor(null);
        attempt.current = null;
        router.refresh();
      } catch {
        setFeedback({ error: true, text: 'The update could not be confirmed. Retry with the same details.' });
      }
    });
  }

  return <div className="space-y-4">
    {feedback && (feedback.error ? <p role="alert" className="rounded-lg bg-[#F7DFDF] p-3 text-sm text-[#811B24]">{feedback.text}</p>
      : <output className="block rounded-lg bg-[#DFECE4] p-3 text-sm text-[#21553E]">{feedback.text}</output>)}
    {partners.map(partner => <div key={partner.id} className="space-y-3">
      <PartnerCard partner={partner} hasNcmSettings={ncm?.partnerId === partner.id} connected={connectedNcmId === partner.id}
        busy={busy} onEdit={() => setEditor({ id: partner.id, existing: true })}
        onMakeDefault={() => save({ id: partner.id, name: partner.name, status: partner.status, collectsCod: partner.collectsCod,
          bookingMode: 'manual', trackingPattern: partner.trackingPattern ?? '', makeDefault: true, expectedRevision: partner.revision })} />
      {editing?.id === partner.id && <PartnerEditor key={partner.id + ':' + partner.revision} id={partner.id} partner={partner}
        canSelectApi={connectedNcmId === partner.id} busy={busy} onSave={save} onCancel={() => setEditor(null)} />}
      {ncm?.partnerId === partner.id && <NcmSettings view={ncm} actorId={actorId} partnerBusy={busy} />}
    </div>)}
    {!partners.length && <p className={panel + ' p-4 text-sm text-[#46536F]'}>No delivery partners added yet. Add the courier you book with today.</p>}
    {editor && !editor.existing
      ? <PartnerEditor key={editor.id} id={editor.id} busy={busy} onSave={save} onCancel={() => setEditor(null)} />
      : <button type="button" className={control} disabled={busy} onClick={() => setEditor({ id: crypto.randomUUID(), existing: false })}>
        <Plus aria-hidden="true" className="size-4" /> Add a delivery partner
      </button>}
  </div>;
}
