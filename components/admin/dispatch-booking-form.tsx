'use client';

import { Bell } from 'lucide-react';
import { useId, useState, type SyntheticEvent } from 'react';
import type { DispatchParcel } from '@/app/admin/orders/dispatch/read-dispatch';
import { dispatchWeightTotal } from '@/app/admin/orders/dispatch/packing-summary';
import {
  parsePickupTime,
  pickupWindowLabel,
  type PickupWindow,
} from '@/app/admin/orders/dispatch/pickup-window';
import {
  ConfiguredFields,
  focusConfiguredField,
} from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import {
  clearSessionAttempt,
  getOrCreateSessionAttempt,
  sessionAttemptKey,
} from '@/lib/forms/client-attempt';
import {
  configuredJsonPayload,
  digestFormRequest,
  readConfiguredSubmission,
} from '@/lib/forms/client-submission';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { DispatchCourierDetails } from './dispatch-courier-details';
import {
  dispatchConfiguredControlSize,
  NcmDispatchReview,
  type NcmDispatchResult,
  type NcmDispatchSettings,
} from './ncm-dispatch-actions';
import {
  dispatchChip,
  dispatchMoney,
  dispatchPanel,
} from './dispatch-parcel-list';

const formId = 'staff.parcel-control';
const formKeys = [
  'jobId',
  'version',
  'action',
  'note',
  'method',
  'riderEmail',
  'courierName',
  'trackingCode',
  'trackingUrl',
  'reference',
  'amount',
  'amountPaisa',
  'cashRecordId',
  'requestId',
];
const fieldClass =
  'min-h-11 w-full min-w-0 rounded-xl border border-[#D4C2A6] bg-white px-3 py-2 text-base font-normal';
const defaultCourier = 'Nepal Can Move';

export type DispatchPartner = {
  id: string;
  name: string;
  collectsCod: boolean;
  hasTrackingPattern: boolean;
};

function parcelCount(count: number) {
  return `${count} ${count === 1 ? 'parcel' : 'parcels'}`;
}

export function DispatchBookingForm({
  parcels,
  pickup,
  options,
  partners,
  ncm,
  ncmBlocked,
  actorId,
  refreshing,
  onBusy,
  onSaved,
  onNotice,
  onNcmResults,
}: {
  parcels: DispatchParcel[];
  pickup: DispatchParcel | undefined;
  options: (PickupWindow & { label: string })[];
  partners: readonly DispatchPartner[] | null;
  ncm?: NcmDispatchSettings | null;
  ncmBlocked?: ReadonlySet<string>;
  actorId: string;
  refreshing: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: (keys: readonly string[]) => void;
  onNotice: (message: string, error: boolean) => void;
  onNcmResults: (results: NcmDispatchResult[]) => void;
}) {
  const courierFieldId = useId();
  const [courier, setCourier] = useState('');
  const [otherCourier, setOtherCourier] = useState('');
  const [reference, setReference] = useState('');
  const [slot, setSlot] = useState<number | null>(
    () =>
      options.find((option) => option.label === 'Tomorrow 9–11 am')?.start ??
      options[0]?.start ??
      null,
  );
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewedSelection, setReviewedSelection] = useState<string | null>(null);
  const disabled = busy || refreshing;
  const chosen = options.find((option) => option.start === slot);
  const manualStart = parsePickupTime(customStart);
  const manualEnd = parsePickupTime(customEnd);
  const manualWindow =
    Number.isFinite(manualStart) && manualStart >= 0 && manualEnd > manualStart;
  const window =
    chosen ??
    (slot === null && manualWindow
      ? { start: manualStart, end: manualEnd }
      : undefined);
  const activeChoice = partners?.find(partner => `partner:${partner.id}` === courier);
  const selectedPartner = activeChoice ?? (courier !== 'other' ? partners?.[0] : undefined);
  const selection = selectedPartner ? `partner:${selectedPartner.id}` : partners === null && courier !== 'other' ? 'legacy' : 'other';
  const ncmSettings = !pickup && selectedPartner?.id === ncm?.partnerId ? ncm : null;
  const selectionKey = JSON.stringify(
    parcels.map(({ key, jobId, version }) => [key, jobId, version]),
  );
  const reviewOpen = Boolean(ncmSettings && reviewedSelection === selectionKey);
  const blocked = ncmBlocked ?? new Set<string>();
  const handBlocked = !pickup && parcels.some(({key}) => blocked.has(key));
  const catalog = usePublishedFormConfig(formId, { actorId, enabled: !reviewOpen });
  const courierName = selectedPartner?.name ?? (selection === 'legacy' ? defaultCourier : otherCourier.trim());
  const cashCompatible = selectedPartner?.collectsCod !== false || parcels.every(parcel => parcel.codDuePaisa === 0);
  const bookingPlaceholder = courierName ? `${courierName} booking number` : 'Courier booking number';
  const trackingCode = reference.trim();
  const ready = Boolean(
    pickup || (!handBlocked && window && courierName.length >= 2 && trackingCode.length >= 2 && cashCompatible),
  );
  const sellers = [...new Set(parcels.map((parcel) => parcel.sellerName))].join(
    ', ',
  );
  const cash = parcels.every((parcel) => parcel.codDuePaisa !== null)
    ? parcels.reduce((total, parcel) => total + (parcel.codDuePaisa ?? 0), 0)
    : null;
  const weightSummary = dispatchWeightTotal(parcels);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewOpen || !ready || !catalog.config || !catalog.canSubmit || disabled) return;
    const form = event.currentTarget;
    const targets = pickup ? [pickup] : parcels;
    const saved: string[] = [];
    const failures: string[] = [];
    setBusy(true);
    onBusy(true);
    setErrors({});
    onNotice('', false);
    try {
      const submission = readConfiguredSubmission(
        form,
        catalog.config,
        formKeys,
      );
      const formAnswers = configuredJsonPayload(
        catalog.config,
        submission.answers,
        formKeys,
      );
      const trackingUrl = new FormData(form).get('trackingUrl');
      for (const parcel of targets) {
        const payload = {
          orderId: parcel.orderId,
          sellerId: parcel.sellerId,
          jobId: parcel.version === null ? null : parcel.jobId,
          version: parcel.version,
          ...formAnswers,
          ...(pickup
            ? { action: 'dispatch' }
            : {
                action: 'assign',
                courierName,
                trackingCode,
                trackingUrl,
                pickupStart: window?.start,
                pickupEnd: window?.end,
                ...(selectedPartner ? { deliveryPartnerId: selectedPartner.id } : {}),
              }),
        };
        const attempt = sessionAttemptKey(
          `${formId}-dispatch`,
          await digestFormRequest(payload),
        );
        const requestId = getOrCreateSessionAttempt(attempt);
        try {
          const response = await fetch('/admin/orders/dispatch/booking', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              [ACTOR_INTENT_HEADER]: actorId,
            },
            body: JSON.stringify({ ...payload, requestId }),
          });
          const result = (await response.json().catch(() => null)) as {
            ok?: boolean;
            error?: string;
            code?: string;
            fieldId?: string;
          } | null;
          if (!response.ok || result?.ok !== true) {
            failures.push(
              `${parcel.orderNumber}: ${result?.error ?? 'The save could not be verified. Try again.'}`,
            );
            if (result?.code === 'stale_version') {
              catalog.handleSubmissionResponse(response, result.code);
              break;
            }
            if (result?.fieldId) {
              setErrors({
                [result.fieldId]: result.error ?? 'Review this answer.',
              });
              focusConfiguredField(form, result.fieldId);
              break;
            }
          } else {
            clearSessionAttempt(attempt);
            saved.push(parcel.key);
          }
        } catch {
          failures.push(
            `${parcel.orderNumber}: The save could not be verified. Try again.`,
          );
        }
      }
    } catch (error) {
      failures.push(
        error instanceof Error
          ? error.message
          : 'The courier update could not be saved.',
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
    if (saved.length) onSaved(saved);
    if (saved.length === targets.length && !pickup) setReference('');
    const success = saved.length
      ? pickup
        ? 'Courier pickup recorded.'
        : `${parcelCount(saved.length)} booked with ${courierName}.`
      : '';
    onNotice(
      [success, ...failures].filter(Boolean).join(' '),
      failures.length > 0,
    );
  }

  const bookingForm = (
    <section
      className={`${dispatchPanel} space-y-4 p-5`}
      aria-labelledby="book-courier-title"
    >
      <h2 id="book-courier-title" className="text-lg font-semibold">
        {pickup ? 'Record courier pickup' : 'Book a courier pickup'}
      </h2>
      {!pickup ? (
        <div className="space-y-4 text-sm">
          <p className="break-words text-[#46536F]">
            <strong className="text-[#14213D]">
              {parcelCount(parcels.length)}
            </strong>{' '}
            from {sellers}
            {cash === null ? (
              ' · See the parcel details below for cash to collect.'
            ) : (
              <>
                {' '}
                · cash to collect{' '}
                <strong className="whitespace-nowrap text-[#14213D]">
                  {dispatchMoney(cash)}
                </strong>
              </>
            )}
          </p>
          {weightSummary ? <p className="text-[#46536F]">{weightSummary}</p> : null}
          <div className="space-y-1.5 font-semibold">
            <label htmlFor={courierFieldId}>Courier</label>
            <select
              id={courierFieldId}
              className={fieldClass}
              value={selection}
              disabled={disabled}
              onChange={(event) => {
                setCourier(event.target.value);
                setReviewedSelection(null);
              }}
            >
              {partners === null ? <option value="legacy">{defaultCourier}</option> : null}
              {partners?.map(partner => <option key={partner.id} value={`partner:${partner.id}`}>{partner.name}</option>)}
              <option value="other">Other courier company</option>
            </select>
            {!reviewOpen && !handBlocked ? <p className="text-[13px] font-normal text-[#675B4E]">{courierName
              ? `Book with ${courierName}, then enter its booking number here.`
              : 'Enter the name of the courier you booked.'}</p> : null}
          </div>
          {ncmSettings ? (
            <>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">NCM booking method</legend>
                <button type="button" className={dispatchChip} aria-pressed={reviewOpen} disabled={disabled || parcels.every(({ key }) => blocked.has(key))} onClick={() => setReviewedSelection(selectionKey)}>
                  Book with NCM
                </button>
                <button type="button" className={dispatchChip} aria-pressed={!reviewOpen} disabled={disabled || handBlocked} onClick={() => setReviewedSelection(null)}>
                  Book by hand
                </button>
              </fieldset>
              <p className="text-[#46536F]">{ncmSettings.usedToday.toLocaleString('en-IN')} of {ncmSettings.limit.toLocaleString('en-IN')} NCM bookings used today</p>
            </>
          ) : null}
          {handBlocked ? <p className="text-[#A8232E]">Check NCM before booking the flagged parcels again. Clear those selections to book other parcels by hand.</p> : null}
        </div>
      ) : null}
      {reviewOpen && ncmSettings ? (
        <NcmDispatchReview
          key={selectionKey}
          parcels={parcels}
          actorId={actorId}
          settings={ncmSettings}
          disabled={disabled}
          blocked={blocked}
          onBusy={onBusy}
          onSaved={onSaved}
          onResults={onNcmResults}
        />
      ) : null}
      <form
        hidden={reviewOpen || handBlocked}
        data-form-id="staff.parcel-control"
        onSubmit={(event) => void submit(event)}
        className="space-y-4 text-sm [&>div:empty]:hidden"
      >
        {pickup ? (
          <p>
            Confirm the courier has collected{' '}
            <strong>{pickup.orderNumber}</strong> from {pickup.sellerName}.
          </p>
        ) : (
          <>
            {selection === 'other' ? (
              <label className="block space-y-1.5 font-semibold">
                <span>Courier name</span>
                <input
                  className={fieldClass}
                  value={otherCourier}
                  required
                  minLength={2}
                  maxLength={120}
                  disabled={disabled}
                  onChange={(event) => setOtherCourier(event.target.value)}
                />
              </label>
            ) : null}
            <fieldset className="min-w-0 space-y-1.5" disabled={disabled}>
              <legend className="font-semibold">Pickup</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <button
                    type="button"
                    className={dispatchChip}
                    key={option.start}
                    aria-pressed={slot === option.start}
                    onClick={() => setSlot(option.start)}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={dispatchChip}
                  aria-pressed={slot === null}
                  onClick={() => setSlot(null)}
                >
                  Other time
                </button>
              </div>
              {slot === null ? (
                <div className="space-y-2 pt-1">
                  <p className="text-[#46536F]">
                    Enter the courier’s pickup window in Nepal time.
                  </p>
                  <label className="block space-y-1.5 font-semibold">
                    <span>Start</span>
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      required
                      value={customStart}
                      onChange={(event) => setCustomStart(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1.5 font-semibold">
                    <span>End</span>
                    <input
                      type="datetime-local"
                      className={fieldClass}
                      required
                      min={customStart || undefined}
                      value={customEnd}
                      onChange={(event) => setCustomEnd(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </fieldset>
            <label className="block min-w-0 space-y-1.5 font-semibold">
              <span>Courier’s booking or tracking number</span>
              <input
                className={fieldClass}
                required
                minLength={2}
                maxLength={80}
                value={reference}
                disabled={disabled}
                placeholder={bookingPlaceholder}
                onChange={(event) => setReference(event.target.value)}
              />
              <span className="block text-[13px] font-normal text-[#675B4E]">
                Shown to the customer as their tracking number. Add separate
                tracking numbers on each order if the courier gives you one per
                parcel.
              </span>
            </label>
            {!selectedPartner?.hasTrackingPattern ? <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-[#46536F] underline decoration-[#D4C2A6] underline-offset-4">
                Add a tracking link
              </summary>
              <label className="block space-y-1.5 font-semibold">
                <span>Tracking link</span>
                <input
                  type="url"
                  className={fieldClass}
                  name="trackingUrl"
                  maxLength={500}
                  disabled={disabled}
                  placeholder="https://"
                />
              </label>
            </details> : null}
          </>
        )}
        {catalog.config ? (
          <div className={`${dispatchConfiguredControlSize} [&>div:empty]:hidden [&:not(:has([data-configured-field]))]:hidden`}>
            <ConfiguredFields
              config={catalog.config}
              baseKeys={formKeys}
              errors={errors}
            />
          </div>
        ) : null}
        {catalog.message ? (
          <div className="text-[#A8232E]">
            <output className="block">{catalog.message}</output>
            <button
              type="button"
              className={dispatchChip}
              onClick={catalog.refresh}
            >
              Refresh form
            </button>
          </div>
        ) : null}
        <button
          type="submit"
          disabled={!ready || !catalog.canSubmit || disabled}
          className="min-h-11 w-full rounded-xl bg-[#14213D] px-3 py-2 font-semibold text-white hover:bg-[#2C3B5C] disabled:bg-[#959BA8]"
        >
          {busy
            ? 'Saving…'
            : pickup
              ? 'Confirm courier pickup'
              : `Book pickup for ${parcelCount(parcels.length)}`}
        </button>
        {!pickup && !ready ? (
          <p className="text-[13px] text-[#46536F]">
            {!cashCompatible
              ? 'This courier does not collect cash. Choose another courier.'
              : trackingCode.length < 2
              ? 'Add the courier’s booking number first.'
              : !window
                ? 'Choose the pickup window.'
                : 'Enter the courier name.'}
          </p>
        ) : null}
        {!pickup && window && courierName ? (
          <p className="flex gap-3 break-words rounded-xl bg-[#E2E8F4] p-4 text-[#233B66]">
            <Bell className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              The seller sees{' '}
              <strong className="text-[#14213D]">
                “Courier booked: {courierName},{' '}
                {pickupWindowLabel(window.start, window.end)}”
              </strong>{' '}
              on each order, and the customer gets the tracking number.
            </span>
          </p>
        ) : null}
      </form>
    </section>
  );
  return (
    <>
      {bookingForm}
      {!pickup && !reviewOpen && !handBlocked ? (
        <DispatchCourierDetails parcels={parcels} courierName={courierName} actorId={actorId} disabled={disabled} />
      ) : null}
    </>
  );
}
