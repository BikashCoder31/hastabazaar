'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type SyntheticEvent } from 'react';
import type { NcmSettingsView } from '@/lib/delivery/ncm-settings';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

const control = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#D7C4A9] px-3 text-sm font-semibold hover:bg-[#F7F3EC] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const field = 'min-h-11 w-full min-w-0 rounded-lg border border-[#D7C4A9] bg-white px-3 text-base font-normal disabled:opacity-50';
const deliveryTypes = [
  { value: 'Door2Door', label: 'Door to door' },
  { value: 'Branch2Door', label: 'Branch to door' },
  { value: 'Door2Branch', label: 'Door to branch' },
  { value: 'Branch2Branch', label: 'Branch to branch' },
] as const;
const timestamp = new Intl.DateTimeFormat('en-NP', {
  timeZone: 'Asia/Kathmandu', dateStyle: 'medium', timeStyle: 'short',
});

type Pickup = NcmSettingsView['pickups'][number];
type MapAction = { action: 'map'; pickupAddressId: string; addressUpdatedAt: number; branch: string };
type NcmAction = { action: 'test' } | { action: 'refresh' } | MapAction | {
  action: 'settings'; deliveryType: NcmSettingsView['deliveryType']; packageName: string; revision: number;
};
type Feedback = { request: NcmAction; text: string; error?: boolean };
const success = {
  test: 'Connection verified.', refresh: 'Branch list refreshed.',
  settings: 'Booking defaults saved.', map: 'Pickup branch confirmed.',
};

function RecordedTime({ value }: { value: number | null }) {
  return value === null ? 'No record yet' : <time dateTime={new Date(value).toISOString()}>{timestamp.format(value)}</time>;
}

function ActionFeedback({ value }: { value: Feedback | null }) {
  if (!value) return null;
  return value.error
    ? <p role="alert" className="rounded-lg bg-[#F7DFDF] p-3 text-sm text-[#811B24]">{value.text}</p>
    : <output className="block rounded-lg bg-[#DFECE4] p-3 text-sm text-[#21553E]">{value.text}</output>;
}

function PickupBranchForm({ pickup, assignedBranches, disabled, feedback, onSave }: {
  pickup: Pickup; assignedBranches: string[]; disabled: boolean;
  feedback: Feedback | null; onSave: (value: MapAction) => void;
}) {
  const confirmed = pickup.branch && assignedBranches.includes(pickup.branch) ? pickup.branch : '';
  const suggested = pickup.suggestedBranch && assignedBranches.includes(pickup.suggestedBranch) ? pickup.suggestedBranch : '';
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const branch = new FormData(event.currentTarget).get('branch');
    if (typeof branch === 'string' && assignedBranches.includes(branch)) {
      onSave({ action: 'map', pickupAddressId: pickup.id, addressUpdatedAt: pickup.updatedAt, branch });
    }
  }

  return <form data-form-id="system.ncm-pickup-branch" onSubmit={submit} className="min-w-0 space-y-3 rounded-lg border border-[#E2D6C2] p-3 sm:p-4">
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
      <div className="min-w-0 space-y-1">
        <p className="wrap-anywhere text-sm font-semibold">{pickup.sellerName}</p>
        <p className="wrap-anywhere text-sm text-[#46536F]">{pickup.address}</p>
        {confirmed
          ? <p className="wrap-anywhere text-sm text-[#21553E]">Confirmed: {confirmed}</p>
          : <div className="space-y-1 text-sm text-[#69430A]">
            {suggested && <p className="wrap-anywhere">Suggested branch: {suggested}</p>}
            <p>Confirm a pickup branch before booking parcels from this address with NCM.</p>
          </div>}
      </div>
      <fieldset disabled={disabled} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid min-w-0 gap-1 text-sm font-semibold">Pickup branch
          <select key={confirmed || suggested} name="branch" required className={field}
            aria-label={`Pickup branch for ${pickup.sellerName}, ${pickup.address}`} defaultValue={confirmed || suggested}>
            <option value="" disabled>Choose a branch</option>
            {assignedBranches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
          </select>
        </label>
        <button type="submit" className={control}>Confirm branch</button>
      </fieldset>
    </div>
    <ActionFeedback value={feedback} />
  </form>;
}

export function NcmSettings({ view, actorId, partnerBusy }: {
  view: NcmSettingsView; actorId: string; partnerBusy: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const attempt = useRef<{ hash: string; requestId: string } | null>(null);
  const busy = pending || partnerBusy;
  const connected = view.configured && view.connectedAt !== null;
  const branchList = view.assignedBranches.join(', ');

  function save(request: NcmAction) {
    if (busy) return;
    const payload = { partnerId: view.partnerId, ...request };
    const hash = JSON.stringify(payload);
    const requestId = attempt.current?.hash === hash ? attempt.current.requestId : crypto.randomUUID();
    attempt.current = { hash, requestId };
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/delivery-partners/ncm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
          body: JSON.stringify({ ...payload, requestId }),
        });
        const body = await response.json() as { ok?: boolean; error?: string };
        if (!response.ok || body.ok !== true) {
          setFeedback({ request, error: true, text: body.error ?? 'The NCM update could not be saved.' });
          if (request.action === 'refresh') startTransition(() => router.refresh());
          return;
        }
        attempt.current = null;
        startTransition(() => {
          setFeedback({ request, text: success[request.action] });
          router.refresh();
        });
      } catch {
        setFeedback({ request, error: true, text: 'The update could not be confirmed. Retry with the same details.' });
      }
    });
  }

  function saveDefaults(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connected) return;
    const data = new FormData(event.currentTarget);
    const deliveryType = deliveryTypes.find(option => option.value === data.get('deliveryType'))?.value;
    const packageName = data.get('packageName');
    if (deliveryType && typeof packageName === 'string') {
      save({ action: 'settings', deliveryType, packageName: packageName.trim(), revision: view.revision });
    }
  }

  return <section aria-label="Nepal Can Move API settings" className="min-w-0 space-y-5 rounded-xl border border-[#E2D6C2] bg-white p-4 sm:p-5">
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <h3 className="font-semibold">NCM connection</h3>
        <p className={'wrap-anywhere rounded-lg p-3 text-sm font-semibold ' + (connected ? 'bg-[#DFECE4] text-[#21553E]' : 'bg-[#F7E9C5] text-[#69430A]')}>
          {connected ? `Connected · pickup branches: ${branchList || 'none assigned'}` : view.configured
            ? 'Test the connection to enable API booking and settings.'
            : 'Set the NCM API address and token in the protected app environment to test the connection.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={control} disabled={busy || !view.configured} onClick={() => save({ action: 'test' })}>Test connection</button>
          <button type="button" className={control} disabled={busy || !connected || !view.canRefresh} onClick={() => save({ action: 'refresh' })}>Refresh branches</button>
        </div>
        <div className="space-y-1 text-xs text-[#46536F]">
          <p>Last branch refresh · <RecordedTime value={view.branchesCheckedAt} />. The branch list can be refreshed once a day.</p>
          {connected && <p>Last connection test · <RecordedTime value={view.connectedAt} /></p>}
        </div>
        <ActionFeedback value={feedback?.request.action === 'test' || feedback?.request.action === 'refresh' ? feedback : null} />
      </div>
      <form data-form-id="system.ncm-booking-defaults" onSubmit={saveDefaults} key={`${view.deliveryType}:${view.packageName}`} className="min-w-0 space-y-3">
        <h3 className="font-semibold">Booking defaults</h3>
        <fieldset disabled={busy || !connected} className="grid min-w-0 justify-items-start gap-3">
          <label className="grid w-full min-w-0 gap-1 text-sm font-semibold">Default delivery type
            <select className={field} name="deliveryType" defaultValue={view.deliveryType}>
              {deliveryTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label className="grid w-full min-w-0 gap-1 text-sm font-semibold">Default package name
            <input name="packageName" defaultValue={view.packageName} maxLength={120} placeholder="Handmade goods" className={field} />
          </label>
          <button type="submit" className={control}>Save booking defaults</button>
        </fieldset>
        <ActionFeedback value={feedback?.request.action === 'settings' ? feedback : null} />
      </form>
    </div>
    <div className="space-y-3 border-t border-[#E2D6C2] pt-4">
      <h3 className="font-semibold">Pickup branch per pickup address</h3>
      {!connected && <p className="text-sm text-[#46536F]">Test the connection to load your assigned pickup branches.</p>}
      {connected && !view.assignedBranches.length && <p className="text-sm text-[#46536F]">Ask Nepal Can Move to assign a pickup branch before booking parcels with the API.</p>}
      {view.pickups.length === 0 && <p className="text-sm text-[#46536F]">No seller pickup addresses to map.</p>}
      {view.pickups.map(pickup => <PickupBranchForm key={`${pickup.id}:${pickup.updatedAt}`} pickup={pickup}
        assignedBranches={view.assignedBranches} disabled={busy || !connected || !view.assignedBranches.length}
        feedback={feedback?.request.action === 'map' && feedback.request.pickupAddressId === pickup.id ? feedback : null} onSave={save} />)}
    </div>
    <p className="border-t border-[#E2D6C2] pt-4 text-xs text-[#46536F]">
      <strong>NCM updates:</strong> last webhook <RecordedTime value={view.lastWebhookAt} /> · last check <RecordedTime value={view.lastCheckAt} />
    </p>
  </section>;
}
