'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';
import { Button } from '@/components/ui/button';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import type { DeliveryInfo } from '@/lib/delivery/repository';

const baseKeys = ['method', 'riderEmail', 'courierName', 'trackingUrl',
  'trackingReference', 'orderId', 'requestId', 'formVersion', 'customAnswers'];

export function DeliveryAssignment({ orderId, current, riderEmail, isSuperAdmin = false }: {
  orderId: string; current: DeliveryInfo | null; riderEmail?: string; isSuperAdmin?: boolean;
}) {
  const [method, setMethod] = useState(isSuperAdmin && current?.method === 'own_rider' ? 'own_rider' : 'courier');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const catalog = usePublishedFormConfig('staff.delivery-assignment');
  const router = useRouter();

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !catalog.canSubmit || !catalog.config) return;
    setBusy(true);
    try {
      const configured = readConfiguredSubmission(event.currentTarget, catalog.config, baseKeys);
      const data = Object.fromEntries(new FormData(event.currentTarget));
      await sendJson('/api/admin/orders/' + encodeURIComponent(orderId) + '/delivery', 'POST',
        { ...data, method, requestId,
          ...configuredJsonPayload(catalog.config, configured.answers, baseKeys) },
        'Assignment failed.');
      setRequestId(crypto.randomUUID());
      setMessage('Delivery assignment saved. Previous location sharing has been cleared.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Assignment failed.');
    } finally { setBusy(false); }
  }

  return <section className="mt-6 space-y-3 rounded-xl border p-5">
    <h2 className="font-semibold">Delivery assignment</h2>
    <p className="text-sm">One consolidated delivery per order. Assignment does not dispatch the order or change its delivery charge.</p>
    <form data-form-id="staff.delivery-assignment" onSubmit={save} className="space-y-3">
      <FormGuide formId="staff.delivery-assignment" />

      <label className="block">Delivery method
        <select className="mt-1 block w-full rounded border p-2" value={method} onChange={(event) => setMethod(event.target.value)}>
          {isSuperAdmin ? <option value="own_rider">Own rider</option> : null}<option value="courier">Courier company</option>
        </select>
      </label>
      {isSuperAdmin && method === 'own_rider' ? <label className="block">Rider account email
        <input name="riderEmail" type="email" required defaultValue={riderEmail ?? ''} className="block w-full rounded border p-2" />
        <span className="text-sm">Rider must have a registered account. They open /rider after signing in. Saving reassigns this order to that account.</span>
      </label> : <>
        <label className="block">Courier name<input name="courierName" required maxLength={120} defaultValue={current?.courierName ?? ''} className="block w-full rounded border p-2" /></label>
        <label className="block">Tracking reference<input name="trackingReference" required maxLength={80} defaultValue={current?.trackingReference ?? ''} className="block w-full rounded border p-2" /></label>
        <label className="block">Courier tracking link (optional)<input name="trackingUrl" type="url" maxLength={500} defaultValue={current?.trackingUrl ?? ''} className="block w-full rounded border p-2" /></label>
        <p className="text-sm">Courier updates are manual until a supported courier API is connected. Use the courier’s official tracking page.</p>
      </>}
      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={baseKeys} /> : null}
      <Button type="submit" disabled={busy || !catalog.canSubmit}>{busy ? 'Saving…' : 'Save delivery assignment'}</Button>
      {message || catalog.message ? <output className="block">{message || catalog.message}</output> : null}
    </form>
  </section>;
}
