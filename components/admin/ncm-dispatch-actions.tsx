'use client';

import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import type { DispatchParcel } from '@/app/admin/orders/dispatch/read-dispatch';
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
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { packedWeightLabel } from '@/lib/shipping/packed-weight';
import { dispatchChip, dispatchMoney } from './dispatch-parcel-list';

const formId = 'staff.parcel-control';
const formKeys = FORM_REGISTRY[formId].baseFields.map(({ key }) => key);
const fieldClass =
  'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#D4C2A6] bg-white px-3 py-2 text-base font-normal';
const primaryButton =
  'min-h-11 rounded-xl bg-[#14213D] px-3 py-2 font-semibold text-white hover:bg-[#2C3B5C] disabled:bg-[#959BA8]';
export const dispatchConfiguredControlSize =
  '[&_input:not([type=checkbox]):not([type=hidden])]:min-h-11 [&_select]:min-h-11 [&_textarea]:min-h-11 [&_input[type=checkbox]]:size-11';
const reviewMessage = 'Check NCM before retrying';

export type NcmDispatchSettings = {
  partnerId: string;
  usedToday: number;
  limit: number;
};

export type NcmDispatchResult = {
  key: string;
  orderNumber: string;
  sellerName: string;
  status: 'booked' | 'uncertain' | 'error';
  message: string;
  fields?: Record<string, string>;
};

type Draft = {
  receiver: string;
  phone: string;
  address: string;
  pickupBranch: string;
  destinationBranch: string | null;
  deliveryType: string;
  weightGrams: number;
  codPaisa: number;
  packageName: string;
  items: string[];
  instruction: string;
  vendorReference: string;
  chargePaisa: number | null;
  branches: string[];
  reviewKey: string | null;
  orderNumber: string;
};

type Reply = {
  ok?: boolean;
  draft?: Draft;
  trackingNumber?: string;
  error?: string;
  code?: string;
  fieldId?: string;
  fields?: Record<string, string>;
  state?: 'needs_review' | 'booking' | 'rejected' | 'booked';
};

type Action = 'prepare' | 'book' | 'found' | 'retry' | 'note' | 'return';

function payloadFor(action: Action, parcel: DispatchParcel, partnerId: string) {
  return {
    action,
    partnerId,
    selection: {
      orderId: parcel.orderId,
      sellerId: parcel.sellerId,
      jobId: parcel.version === null ? null : parcel.jobId,
      version: parcel.version,
    },
  };
}

async function request(
  actorId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const response = await fetch('/api/admin/delivery-partners/ncm/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [ACTOR_INTENT_HEADER]: actorId,
    },
    body: JSON.stringify(body),
    signal,
  });
  const reply = (await response.json().catch(() => null)) as Reply | null;
  return { response, reply };
}

async function mutate(actorId: string, body: Record<string, unknown>) {
  const key = sessionAttemptKey(
    'staff.parcel-control-ncm',
    await digestFormRequest({ actorId, ...body }),
  );
  const result = await request(actorId, {
    ...body,
    requestId: getOrCreateSessionAttempt(key),
  });
  if (result.response.ok && result.reply?.ok === true) {
    clearSessionAttempt(key);
  }
  return result;
}

function replyFields(reply: Reply | null) {
  return {
    ...reply?.fields,
    ...(reply?.fieldId
      ? { [reply.fieldId]: reply.error ?? 'Review this answer.' }
      : {}),
  };
}

function hasDestination(draft: Draft) {
  return Boolean(draft.destinationBranch && draft.reviewKey);
}

type ReviewEntry = {
  draft?: Draft;
  loading?: boolean;
  error?: string;
  fields?: Record<string, string>;
};

async function prepare(
  actorId: string,
  partnerId: string,
  parcel: DispatchParcel,
  destinationBranch?: string,
  signal?: AbortSignal,
): Promise<ReviewEntry> {
  try {
    const { response, reply } = await request(
      actorId,
      {
        ...payloadFor('prepare', parcel, partnerId),
        ...(destinationBranch ? { destinationBranch } : {}),
      },
      signal,
    );
    if (response.ok && reply?.ok === true && reply.draft) {
      return { draft: reply.draft };
    }
    return {
      error: reply?.error ?? 'The NCM booking details could not be loaded.',
      fields: replyFields(reply),
    };
  } catch {
    return { error: 'The NCM booking details could not be loaded.' };
  }
}

function ReviewFields({ errors }: { errors?: Record<string, string> }) {
  if (!errors || !Object.keys(errors).length) return null;
  const labels: Record<string, string> = {
    name: 'Receiver',
    phone: 'Phone',
    phone2: 'Second phone',
    address: 'Delivery address',
    fbranch: 'Pickup branch',
    branch: 'Destination branch',
    cod_charge: 'Cash NCM collects',
    weight: 'Packed weight',
    package: 'Package',
    instruction: 'Delivery instructions',
    vref_id: 'Courier reference',
    delivery_type: 'Delivery type',
    trackingNumber: 'NCM order number',
    note: 'Note or return reason',
  };
  return (
    <ul className="space-y-1 break-words text-[#A8232E]">
      {Object.entries(errors).map(([field, message]) => (
        <li key={field}>
          <strong>
            {Object.hasOwn(labels, field) ? labels[field] : field}
          </strong>{' '}
          · {message}
        </li>
      ))}
    </ul>
  );
}

function ReviewDetails({
  draft,
  disabled,
  onDestination,
}: {
  draft: Draft;
  disabled: boolean;
  onDestination: (value: string) => void;
}) {
  return (
    <>
      <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-x-3 gap-y-1 break-words [&_dt]:font-medium [&_dt]:text-[#46536F]">
        <dt>Receiver</dt>
        <dd>{draft.receiver}</dd>
        <dt>Phone</dt>
        <dd>{draft.phone}</dd>
        <dt>Delivery address</dt>
        <dd>{draft.address}</dd>
        <dt>Pickup branch</dt>
        <dd>{draft.pickupBranch}</dd>
        <dt>Delivery type</dt>
        <dd>{draft.deliveryType}</dd>
        <dt>Packed weight</dt>
        <dd>{packedWeightLabel(draft.weightGrams)}</dd>
        <dt>Cash NCM collects</dt>
        <dd>{dispatchMoney(draft.codPaisa)}</dd>
        <dt>Package</dt>
        <dd>{draft.packageName || 'None'}</dd>
        <dt>Items</dt>
        <dd>{draft.items.join(', ')}</dd>
        <dt>Delivery instructions</dt>
        <dd>{draft.instruction || 'None'}</dd>
        {draft.vendorReference !== draft.orderNumber ? (
          <>
            <dt>Order number</dt>
            <dd>{draft.orderNumber}</dd>
          </>
        ) : null}
        <dt>Courier reference</dt>
        <dd>{draft.vendorReference}</dd>
      </dl>
      <label className="block font-semibold">
        Destination branch
        <select
          className={fieldClass}
          value={draft.destinationBranch ?? ''}
          disabled={disabled}
          onChange={(event) => onDestination(event.currentTarget.value)}
        >
          <option value="" disabled>
            Choose a destination branch
          </option>
          {draft.branches.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      </label>
      {draft.chargePaisa !== null ? (
        <p className="rounded-lg bg-[#E2E8F4] p-3 font-medium text-[#233B66]">
          NCM charges you {dispatchMoney(draft.chargePaisa)}
        </p>
      ) : draft.destinationBranch ? (
        <p className="text-[#46536F]">NCM’s delivery charge is unavailable.</p>
      ) : null}
    </>
  );
}

type Catalog = ReturnType<typeof usePublishedFormConfig>;

function readAnswers(
  form: HTMLFormElement,
  config: NonNullable<Catalog['config']>,
) {
  const { answers } = readConfiguredSubmission(form, config, formKeys);
  return configuredJsonPayload(config, answers, formKeys);
}

function NcmConfiguredFields({
  catalog,
  errors,
}: {
  catalog: Catalog;
  errors: Record<string, string>;
}) {
  return (
    <>
      {catalog.config ? (
        <div className={dispatchConfiguredControlSize}>
          <ConfiguredFields
            config={catalog.config}
            baseKeys={formKeys}
            errors={errors}
          />
        </div>
      ) : null}
      {!catalog.canSubmit ? (
        <div className="space-y-2">
          <output className="block">
            {catalog.message || 'Form configuration is loading.'}
          </output>
          {catalog.message ? (
            <button
              type="button"
              className={dispatchChip}
              onClick={catalog.refresh}
            >
              Refresh form
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function NcmDispatchReview({
  parcels,
  actorId,
  settings,
  disabled,
  blocked,
  onBusy,
  onSaved,
  onResults,
}: {
  parcels: DispatchParcel[];
  actorId: string;
  settings: NcmDispatchSettings;
  disabled: boolean;
  blocked: ReadonlySet<string>;
  onBusy: (busy: boolean) => void;
  onSaved: (keys: string[]) => void;
  onResults: (results: NcmDispatchResult[]) => void;
}) {
  const [entries, setEntries] = useState<Record<string, ReviewEntry>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState('');
  const [targets] = useState(() =>
    parcels.filter(({ key }) => !blocked.has(key)),
  );
  const running = useRef(false);
  const catalog = usePublishedFormConfig(formId, { actorId });
  const { partnerId, usedToday, limit } = settings;
  const bookableCount = parcels.filter((parcel) => {
    const entry = entries[parcel.key];
    return (
      !blocked.has(parcel.key) &&
      entry?.draft &&
      hasDestination(entry.draft) &&
      !entry.loading
    );
  }).length;
  const loading = parcels.some(
    (parcel) =>
      !blocked.has(parcel.key) &&
      (entries[parcel.key]?.loading ?? !entries[parcel.key]),
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      for (const parcel of targets) {
        if (controller.signal.aborted) break;
        const entry = await prepare(
          actorId,
          partnerId,
          parcel,
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) break;
        setEntries((current) => ({ ...current, [parcel.key]: entry }));
      }
    }
    void load();
    return () => controller.abort();
  }, [actorId, partnerId, targets]);

  async function changeDestination(
    parcel: DispatchParcel,
    draft: Draft,
    destinationBranch: string,
  ) {
    const waiting: Draft = {
      ...draft,
      destinationBranch,
      chargePaisa: null,
      reviewKey: null,
    };
    setEntries((current) => ({
      ...current,
      [parcel.key]: { draft: waiting, loading: true },
    }));
    const entry = await prepare(actorId, partnerId, parcel, destinationBranch);
    setEntries((current) => ({
      ...current,
      [parcel.key]: { ...entry, draft: entry.draft ?? waiting },
    }));
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      disabled ||
      running.current ||
      loading ||
      !catalog.config ||
      !catalog.canSubmit ||
      !bookableCount ||
      usedToday >= limit
    )
      return;
    const form = event.currentTarget;
    setMessage('');
    setErrors({});
    let answers: ReturnType<typeof readAnswers>;
    try {
      answers = readAnswers(form, catalog.config);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Review the configured fields.',
      );
      return;
    }
    running.current = true;
    onBusy(true);
    const results: NcmDispatchResult[] = [];
    const booked: string[] = [];
    let stopped = false;
    let remaining = limit - usedToday;
    for (const [index, parcel] of parcels.entries()) {
      const row = {
        key: parcel.key,
        orderNumber: parcel.orderNumber,
        sellerName: parcel.sellerName,
      };
      const entry = entries[parcel.key];
      const draft = entry?.draft;
      if (blocked.has(parcel.key)) {
        results.push({ ...row, status: 'uncertain', message: reviewMessage });
        continue;
      }
      if (
        !draft?.destinationBranch ||
        !draft.reviewKey ||
        stopped ||
        remaining <= 0
      ) {
        results.push({
          ...row,
          status: 'error',
          message: stopped
            ? 'Refresh the form before booking this parcel.'
            : remaining <= 0
              ? 'Today’s NCM booking limit has been reached.'
              : (entry?.error ??
                'Review the destination branch and NCM quote first.'),
          fields: entry?.fields,
        });
        continue;
      }
      setProgress(`Booking ${index + 1} of ${parcels.length}…`);
      remaining -= 1;
      try {
        // A booking command is sent once. An explicit, server-cleared retry must
        // have a new ID even when the reviewed fields match the first attempt.
        const { response, reply } = await request(actorId, {
          ...payloadFor('book', parcel, partnerId),
          destinationBranch: draft.destinationBranch,
          reviewKey: draft.reviewKey,
          requestId: crypto.randomUUID(),
          ...answers,
        });
        if (response.ok && reply?.ok === true && reply.trackingNumber) {
          booked.push(parcel.key);
          results.push({
            ...row,
            status: 'booked',
            message: `Booked with NCM · ${reply.trackingNumber}`,
          });
        } else if (
          reply?.state === 'booking' ||
          reply?.state === 'needs_review' ||
          reply?.code === 'outcome_unconfirmed' ||
          !reply ||
          (response.status >= 500 && !reply.state && !reply.code)
        ) {
          results.push({ ...row, status: 'uncertain', message: reviewMessage });
        } else {
          const fields = replyFields(reply);
          results.push({
            ...row,
            status: 'error',
            message: reply.error ?? 'NCM could not book this parcel.',
            fields,
          });
          if (reply.code === 'stale_version') {
            catalog.handleSubmissionResponse(response, reply.code);
            stopped = true;
          }
          const configuredField = Object.keys(fields).find((key) =>
            focusConfiguredField(form, key),
          );
          if (configuredField) {
            setErrors(fields);
            stopped = true;
          }
        }
      } catch {
        results.push({ ...row, status: 'uncertain', message: reviewMessage });
      }
    }
    setProgress('');
    onResults(results);
    onSaved(booked);
    running.current = false;
    onBusy(false);
  }

  return (
    <form
      className="space-y-3 text-sm"
      data-form-id={formId}
      onSubmit={(event) => void submit(event)}
    >
      <h3 className="font-semibold">Check NCM booking details</h3>
      {parcels.map((parcel) => {
        const entry = entries[parcel.key];
        return (
          <section
            key={parcel.key}
            className="space-y-3 rounded-xl border border-[#E4DACA] p-3"
            aria-label={`NCM details for ${parcel.orderNumber}, ${parcel.sellerName}`}
          >
            <h4 className="break-words font-semibold">
              {parcel.orderNumber} · {parcel.sellerName}
            </h4>
            {blocked.has(parcel.key) ? (
              <p className="text-[#A8232E]">{reviewMessage}</p>
            ) : (
              <>
                {entry?.draft ? (
                  <ReviewDetails
                    draft={entry.draft}
                    disabled={disabled || entry.loading === true}
                    onDestination={(value) =>
                      void changeDestination(parcel, entry.draft!, value)
                    }
                  />
                ) : null}
                {!entry || entry.loading ? (
                  <output className="block text-[#46536F]">
                    Loading NCM booking details…
                  </output>
                ) : null}
                {entry?.error ? (
                  <p role="alert" className="text-[#A8232E]">
                    {entry.error}
                  </p>
                ) : null}
                <ReviewFields errors={entry?.fields} />
                {entry?.draft?.destinationBranch &&
                !entry.draft.reviewKey &&
                !entry.loading ? (
                  <button
                    type="button"
                    className={dispatchChip}
                    disabled={disabled}
                    onClick={() =>
                      void changeDestination(
                        parcel,
                        entry.draft!,
                        entry.draft!.destinationBranch!,
                      )
                    }
                  >
                    Refresh NCM quote
                  </button>
                ) : null}
              </>
            )}
          </section>
        );
      })}
      <NcmConfiguredFields catalog={catalog} errors={errors} />
      {message ? (
        <p role="alert" className="text-[#A8232E]">
          {message}
        </p>
      ) : null}
      {progress ? <output className="block">{progress}</output> : null}
      <button
        type="submit"
        disabled={
          disabled ||
          loading ||
          !catalog.canSubmit ||
          !bookableCount ||
          usedToday >= limit
        }
        className={`${primaryButton} w-full`}
      >
        {parcels.length === 1 ? 'Confirm NCM booking' : 'Book all with NCM'}
      </button>
    </form>
  );
}

const cardActions = {
  found: 'I found it on NCM · enter NCM order number',
  retry: 'It isn’t on NCM · try again',
  note: 'Add note for NCM',
  return: 'Ask NCM to return',
} as const;

type CardAction = keyof typeof cardActions;

export function NcmDispatchParcelActions({
  parcel,
  actorId,
  partnerId,
  disabled,
  uncertain,
  onBusy,
  onNotice,
  onSettled,
}: {
  parcel: DispatchParcel;
  actorId: string;
  partnerId: string | null;
  disabled: boolean;
  uncertain: boolean;
  onBusy: (busy: boolean) => void;
  onNotice: (message: string, error: boolean) => void;
  onSettled: (key: string) => void;
}) {
  const formIdSuffix = useId();
  const [action, setAction] = useState<CardAction | null>(null);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const running = useRef(false);
  const catalog = usePublishedFormConfig(formId, {
    actorId,
    enabled: action === 'found',
  });
  const booking = parcel.ncmBooking;
  const review =
    uncertain ||
    booking?.state === 'needs_review' ||
    booking?.state === 'booking';
  const booked = booking?.state === 'booked';
  const canReturn =
    parcel.state !== 'returning' &&
    parcel.state !== 'returned' &&
    parcel.state !== 'return_to_origin';
  const availableActions: CardAction[] = review
    ? ['found', 'retry']
    : canReturn
      ? ['note', 'return']
      : ['note'];
  if (!review && !booked) return null;

  function choose(next: CardAction | null) {
    setError('');
    setErrors({});
    setAction(next);
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || running.current || !partnerId || !action) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body: Record<string, unknown> = payloadFor(action, parcel, partnerId);
    setError('');
    setErrors({});
    if (action === 'found') {
      if (!catalog.config || !catalog.canSubmit) return;
      try {
        const trackingNumber = data.get('trackingNumber');
        Object.assign(
          body,
          {
            trackingNumber:
              typeof trackingNumber === 'string' ? trackingNumber.trim() : '',
          },
          readAnswers(form, catalog.config),
        );
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Review the configured fields.',
        );
        return;
      }
    } else if (action === 'note' || action === 'return') {
      const value = data.get('note');
      const note = typeof value === 'string' ? value.trim() : '';
      if (!note) {
        setError(
          action === 'return'
            ? 'Enter a return reason.'
            : 'Enter a note for NCM.',
        );
        return;
      }
      body.note = note;
    }
    running.current = true;
    onBusy(true);
    try {
      const { response, reply } = await mutate(actorId, body);
      if (response.ok && reply?.ok === true) {
        const success = {
          found: `NCM booking recorded${reply.trackingNumber ? ` · ${reply.trackingNumber}` : ''}.`,
          retry: 'You can now review this parcel and book it with NCM.',
          note: 'Note sent to NCM.',
          return: 'Return requested from NCM.',
        };
        choose(null);
        onNotice(`${parcel.orderNumber} · ${success[action]}`, false);
        onSettled(parcel.key);
      } else {
        const fields = replyFields(reply);
        setError(
          reply?.error ??
            'The NCM update could not be verified. Check the parcel before repeating this action.',
        );
        setErrors(fields);
        if (reply?.code === 'stale_version')
          catalog.handleSubmissionResponse(response, reply.code);
        Object.keys(fields).some((key) => focusConfiguredField(form, key));
      }
    } catch {
      setError(
        'The NCM update could not be verified. Check the parcel before repeating this action.',
      );
    } finally {
      running.current = false;
      onBusy(false);
    }
  }

  return (
    <section
      aria-label={`NCM actions for ${parcel.orderNumber}`}
      className="min-w-0 space-y-2 rounded-xl border border-[#E4DACA] bg-[#F7F3EC] p-3 text-sm"
    >
      {review ? (
        <p className="break-words font-semibold text-[#A8232E]">
          {reviewMessage}
          {booking?.state === 'booking'
            ? ' · NCM booking may still be in progress.'
            : null}
        </p>
      ) : (
        <p className="break-words font-semibold">
          NCM order number · {booking?.trackingNumber ?? parcel.trackingNumber}
        </p>
      )}
      <div className="flex min-w-0 flex-wrap gap-2">
        {booked && parcel.jobId && partnerId ? (
          <a
            className={dispatchChip}
            href={`/admin/orders/dispatch/ncm-label?jobId=${encodeURIComponent(parcel.jobId)}`}
          >
            Print NCM label
          </a>
        ) : null}
        {partnerId
          ? availableActions.map((item) => (
              <button
                type="button"
                key={item}
                className={dispatchChip}
                disabled={disabled}
                aria-pressed={action === item}
                onClick={() => choose(action === item ? null : item)}
              >
                {cardActions[item]}
              </button>
            ))
          : null}
      </div>
      {action && partnerId ? (
        <form
          className="space-y-2"
          data-form-id={action === 'found' ? formId : undefined}
          onSubmit={(event) => void submit(event)}
        >
          {action === 'found' ? (
            <>
              <label
                className="block min-w-0 font-semibold"
                htmlFor={formIdSuffix}
              >
                NCM order number
                <input
                  id={formIdSuffix}
                  name="trackingNumber"
                  className={fieldClass}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  maxLength={24}
                  required
                  disabled={disabled}
                />
              </label>
              <NcmConfiguredFields catalog={catalog} errors={errors} />
            </>
          ) : null}
          {action === 'retry' ? (
            <p>
              Confirm that you checked the NCM portal and this parcel isn’t
              listed. You can then book it with NCM again.
            </p>
          ) : null}
          {action === 'note' || action === 'return' ? (
            <label
              className="block min-w-0 font-semibold"
              htmlFor={formIdSuffix}
            >
              {action === 'return' ? 'Return reason' : 'Note for NCM'}
              <textarea
                id={formIdSuffix}
                className={fieldClass}
                name="note"
                minLength={3}
                maxLength={500}
                rows={3}
                required
                disabled={disabled}
              />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-[#A8232E]">
              {error}
            </p>
          ) : null}
          <ReviewFields errors={errors} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className={primaryButton}
              disabled={disabled || (action === 'found' && !catalog.canSubmit)}
            >
              {
                {
                  found: 'Save NCM order number',
                  retry: 'Allow a new booking',
                  note: 'Send note',
                  return: 'Confirm NCM return',
                }[action]
              }
            </button>
            <button
              type="button"
              className={dispatchChip}
              disabled={disabled}
              onClick={() => choose(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

export function NcmDispatchResults({
  results,
}: {
  results: readonly NcmDispatchResult[];
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="space-y-2 rounded-xl border border-[#E4DACA] bg-white p-4 text-sm"
    >
      <h2 id={id} className="font-semibold">
        NCM booking results
      </h2>
      <ul className="space-y-2" aria-live="polite">
        {results.map((result) => (
          <li key={result.key} className="break-words">
            <strong>
              {result.orderNumber} · {result.sellerName}
            </strong>{' '}
            <span
              className={
                result.status === 'booked' ? 'text-[#236548]' : 'text-[#A8232E]'
              }
            >
              {result.message}
            </span>
            <ReviewFields errors={result.fields} />
          </li>
        ))}
      </ul>
    </section>
  );
}
