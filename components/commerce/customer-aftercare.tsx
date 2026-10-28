'use client';

import { FormGuide } from '@/components/forms/form-guide';
import { CircleAlert, FileImage, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { ComplaintRow } from '@/lib/db/repositories/complaints';
import type { ReturnCaseRow } from '@/lib/db/repositories/returns';

interface ReceiptItem {
  id: string;
  productName: string;
  sellerName: string;
  quantity: number;
  returnEligible: boolean;
  fulfillmentStatus?: string;
}

const reasonLabels: Record<string, string> = {
  damaged: 'Damaged',
  defective: 'Defective',
  wrong_item: 'Wrong item',
  not_as_described: 'Not as described',
  counterfeit: 'Possibly counterfeit',
  late_delivery: 'Unreasonably late',
  change_of_mind: 'Changed my mind',
  other: 'Other',
};

function newKey() {
  return crypto.randomUUID();
}

const returnBaseKeys = ['orderItemId', 'quantity', 'requestedResolution', 'reason',
  'detail', 'originalSealIntact', 'locale', 'evidence', 'idempotencyKey'];
const complaintBaseKeys = ['orderItemId', 'category', 'subject', 'detail',
  'locale', 'idempotencyKey'];
function uncertainCaseMessage(kind: 'return request' | 'complaint') {
  return `The ${kind} result is uncertain and may already have been saved. Refresh this receipt and check the saved cases above before retrying this same form with the same answers. Your saved request reference is reused for retries.`;
}

function confirmedCase(result: Record<string, unknown> | null): result is Record<string, unknown> & { message: string } {
  return result !== null && typeof result.id === 'string' && result.id.trim().length > 0 && result.id.length <= 100 &&
    typeof result.referenceNumber === 'string' && result.referenceNumber.trim().length > 0 && result.referenceNumber.length <= 100 &&
    typeof result.duplicate === 'boolean' && typeof result.message === 'string' && result.message.trim().length > 0 && result.message.length <= 1000;
}

export function CustomerAftercare({
  orderNumber,
  orderStatus,
  items,
  returns,
  complaints,
}: {
  orderNumber: string;
  orderStatus: string;
  items: readonly ReceiptItem[];
  returns: readonly ReturnCaseRow[];
  complaints: readonly ComplaintRow[];
}) {
  const router = useRouter();
  const returnForm = usePublishedFormConfig('commerce.return-request');
  const complaintForm = usePublishedFormConfig('commerce.complaint');
  const returnItems=items.filter(item=>item.fulfillmentStatus==='delivered'||(!item.fulfillmentStatus&&orderStatus==='delivered'));
  const returnAttemptKey = sessionAttemptKey('commerce.return-request', orderNumber);
  const complaintAttemptKey = sessionAttemptKey('commerce.complaint', orderNumber);
  const [returnPending, setReturnPending] = useState(false);
  const [complaintPending, setComplaintPending] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [complaintError, setComplaintError] = useState('');
  const [returnMessage, setReturnMessage] = useState('');
  const [complaintMessage, setComplaintMessage] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(returnItems[0]?.id ?? '');
  const selectedItem = items.find((item) => item.id === selectedItemId);

  async function submitReturn(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!returnForm.canSubmit || !returnForm.config) {
      setReturnError(returnForm.message || 'Return form is unavailable.');
      return;
    }
    setReturnPending(true);
    setReturnError('');
    setReturnMessage('');
    try {
      const configured = readConfiguredSubmission(formElement, returnForm.config, returnBaseKeys);
      const form = new FormData(formElement);
      const customKeys = [...form.keys()].filter((key) => key.startsWith('custom.'));
      for (const key of customKeys) form.delete(key);
      const payload = configuredJsonPayload(returnForm.config, configured.answers, returnBaseKeys);
      form.set('formVersion', String(payload.formVersion));
      form.set('customAnswers', JSON.stringify(payload.customAnswers));
      form.set('idempotencyKey', getOrCreateSessionAttempt(returnAttemptKey));
      const response = await fetch(
        `/orders/${encodeURIComponent(orderNumber)}/returns`,
        { method: 'POST', body: form },
      ).catch(() => { throw new Error(uncertainCaseMessage('return request')); });
      const decoded: unknown = await response.json().catch(() => null);
      const result = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
        ? decoded as Record<string, unknown> : null;
      if (response.status === 409 && result?.code === 'stale_version')
        returnForm.handleSubmissionResponse(response);
      if (!response.ok)
        throw new Error(response.status >= 500 ? uncertainCaseMessage('return request') : typeof result?.error === 'string' ? result.error : 'Return request could not be sent.');
      if (!confirmedCase(result))
        throw new Error(uncertainCaseMessage('return request'));
      setReturnMessage(result.message);
      clearSessionAttempt(returnAttemptKey);
      formElement.reset();
      router.refresh();
    } catch (error) {
      setReturnError(
        error instanceof Error
          ? error.message
          : 'Return request could not be sent.',
      );
    } finally {
      setReturnPending(false);
    }
  }

  async function submitComplaint(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!complaintForm.canSubmit || !complaintForm.config) {
      setComplaintError(complaintForm.message || 'Complaint form is unavailable.');
      return;
    }
    setComplaintPending(true);
    setComplaintError('');
    setComplaintMessage('');
    const form = new FormData(formElement);
    try {
      const configured = readConfiguredSubmission(formElement, complaintForm.config, complaintBaseKeys);
      const response = await fetch(
        `/orders/${encodeURIComponent(orderNumber)}/complaints`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            orderItemId: form.get('orderItemId'),
            category: form.get('category'),
            subject: form.get('subject'),
            detail: form.get('detail'),
            locale: 'en-NP',
            idempotencyKey: getOrCreateSessionAttempt(complaintAttemptKey),
            ...configuredJsonPayload(complaintForm.config, configured.answers, complaintBaseKeys),
          }),
        },
      ).catch(() => { throw new Error(uncertainCaseMessage('complaint')); });
      const decoded: unknown = await response.json().catch(() => null);
      const result = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded)
        ? decoded as Record<string, unknown> : null;
      if (response.status === 409 && result?.code === 'stale_version')
        complaintForm.handleSubmissionResponse(response);
      if (!response.ok)
        throw new Error(response.status >= 500 ? uncertainCaseMessage('complaint') : typeof result?.error === 'string' ? result.error : 'Complaint could not be sent.');
      if (!confirmedCase(result))
        throw new Error(uncertainCaseMessage('complaint'));
      setComplaintMessage(result.message);
      clearSessionAttempt(complaintAttemptKey);
      formElement.reset();
      router.refresh();
    } catch (error) {
      setComplaintError(
        error instanceof Error ? error.message : 'Complaint could not be sent.',
      );
    } finally {
      setComplaintPending(false);
    }
  }

  return (
    <section
      className="customer-form mt-8 border-t pt-8"
      aria-labelledby="aftercare-title"
    >
      <p className="eyebrow">Returns and support</p>
      <h2 id="aftercare-title" className="mt-2 font-heading text-3xl">
        Help after your order
      </h2>
      <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
        Requests are handled per item, so another seller’s item is not affected.
      </p>

      {returns.length || complaints.length ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {returns.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border bg-muted/20 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {item.referenceNumber}
                  </span>
                  <h3 className="mt-1 font-semibold">{item.productName}</h3>
                </div>
                <CaseStatus status={item.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {reasonLabels[item.reason] || item.reason} ·{' '}
                {item.requestedResolution.replaceAll('_', ' ')}
              </p>
              <p className="mt-3 text-sm leading-6">
                {item.eligibilityReasonEn}
              </p>
              {item.sellerResponse ? (
                <p className="mt-3 rounded-lg bg-background p-3 text-sm">
                  <strong>Seller response:</strong> {item.sellerResponse}
                </p>
              ) : null}
              {item.refundAmountPaisa ? (
                <p className="mt-3 text-sm font-semibold">
                  Cash refund: {money(item.refundCashPaisa ?? 0)}
                  {item.refundWalletPaisa ? ` + ${money(item.refundWalletPaisa)} shopping credit` : ''} ·{' '}
                  {item.refundStatus?.replaceAll('_', ' ')}
                  {item.refundPromoPaisa ? <span className="block font-normal">Promo savings: {money(item.refundPromoPaisa)} (not refundable)</span> : null}
                </p>
              ) : null}
              {item.status === 'needs_customer_changes' ? (
                <CustomerReply
                  endpoint={`/orders/${encodeURIComponent(orderNumber)}/returns/${encodeURIComponent(item.id)}/reply`}
                />
              ) : null}
            </article>
          ))}
          {complaints.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border bg-muted/20 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {item.referenceNumber}
                  </span>
                  <h3 className="mt-1 font-semibold">{item.subject}</h3>
                </div>
                <CaseStatus status={item.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {item.category.replaceAll('_', ' ')}
                {item.assignedName ? ` · assigned to ${item.assignedName}` : ''}
              </p>
              {item.resolution ? (
                <p className="mt-3 text-sm leading-6">
                  <strong>Resolution:</strong> {item.resolution}
                </p>
              ) : null}
              {item.status === 'waiting_customer' ? (
                <CustomerReply
                  endpoint={`/orders/${encodeURIComponent(orderNumber)}/complaints/${encodeURIComponent(item.id)}/reply`}
                />
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <Accordion multiple className="mt-7 gap-4">
        <AccordionItem
          value="return"
          className="overflow-hidden rounded-2xl border bg-card px-5 sm:px-6"
        >
          <AccordionTrigger className="min-h-16 py-5 text-lg font-semibold">
            <span className="flex items-center gap-3">
              <RotateCcw className="size-5 text-primary" />
              Return or replace an item
            </span>
          </AccordionTrigger>
          <AccordionContent className="h-auto pb-6">
            <form data-form-id="commerce.return-request" onSubmit={submitReturn} className="border-t pt-5">
      <FormGuide formId="commerce.return-request" />

              <div className="flex items-center gap-2">
                <RotateCcw className="size-5 text-primary" />
                <h3 className="font-heading text-2xl">Request a return</h3>
              </div>
              {returnItems.length===0 ? (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Return requests become available after delivery is confirmed.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  <Field label="Item">
                    <select
                      name="orderItemId"
                      value={selectedItemId}
                      onChange={(event) =>
                        setSelectedItemId(event.target.value)
                      }
                      required
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    >
                      {returnItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.productName} · {item.sellerName}
                          {item.returnEligible ? '' : ' · defect-only return'}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Quantity">
                      <Input
                        key={selectedItemId}
                        name="quantity"
                        type="number"
                        min={1}
                        max={selectedItem?.quantity ?? 1}
                        defaultValue={1}
                        required
                      />
                    </Field>
                    <Field label="Preferred resolution">
                      <select
                        name="requestedResolution"
                        required
                        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                      >
                        <option value="refund">Refund</option>
                        <option value="replacement">Replacement</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Reason">
                    <select
                      name="reason"
                      required
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    >
                      {Object.entries(reasonLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="What happened?">
                    <Textarea
                      name="detail"
                      minLength={20}
                      maxLength={2000}
                      required
                      placeholder="Describe the issue, condition, and when you noticed it."
                    />
                  </Field>
                  <label className="flex items-start gap-3 rounded-lg border p-3 text-sm leading-6">
                    <input
                      className="mt-1"
                      type="checkbox"
                      name="originalSealIntact"
                      value="yes"
                    />
                    <span>
                      This product was supplied with an original seal and that
                      seal is still intact. Hastabazaar will verify this for the
                      15-calendar-day sealed-goods window.
                    </span>
                  </label>
                  <input type="hidden" name="locale" value="en-NP" />
                  <Field label="Photos or evidence (optional, up to 5)">
                    <Input
                      name="evidence"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      multiple
                    />
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <FileImage className="size-3.5" /> JPG, PNG, WebP, or PDF
                      · 5 MB each. Missing photos do not automatically
                      invalidate a statutory claim.
                    </p>
                  </Field>
                  {returnForm.config ? <ConfiguredFields config={returnForm.config} baseKeys={returnBaseKeys} /> : null}
                  {!returnForm.canSubmit ? <output>{returnForm.message || 'Loading return form…'}</output> : null}
                  {returnError ? (
                    <p
                      role="alert"
                      className="text-sm font-medium text-destructive"
                    >
                      {returnError}
                    </p>
                  ) : null}
                  {returnMessage ? (
                    <output className="block text-sm font-medium text-emerald-700">
                      {returnMessage}
                    </output>
                  ) : null}
                  <Button type="submit" disabled={returnPending || !returnForm.canSubmit}>
                    {returnPending ? 'Sending…' : 'Send return request'}
                  </Button>
                </div>
              )}
            </form>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem
          value="complaint"
          className="overflow-hidden rounded-2xl border bg-card px-5 sm:px-6"
        >
          <AccordionTrigger className="min-h-16 py-5 text-lg font-semibold">
            <span className="flex items-center gap-3">
              <CircleAlert className="size-5 text-primary" />
              Get help or raise a complaint
            </span>
          </AccordionTrigger>
          <AccordionContent className="h-auto pb-6">
            <form data-form-id="commerce.complaint" onSubmit={submitComplaint} className="border-t pt-5">
      <FormGuide formId="commerce.complaint" />

              <div className="flex items-center gap-2">
                <CircleAlert className="size-5 text-primary" />
                <h3 className="font-heading text-2xl">Raise a complaint</h3>
              </div>
              <div className="mt-5 space-y-4">
                <Field label="Related item (optional)">
                  <select
                    name="orderItemId"
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  >
                    <option value="">Whole order or service</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.productName} · {item.sellerName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    name="category"
                    required
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  >
                    <option value="product">Product</option>
                    <option value="delivery">Delivery</option>
                    <option value="seller">Seller</option>
                    <option value="refund">Refund</option>
                    <option value="service">Hastabazaar service</option>
                    <option value="safety">Safety or urgent concern</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Subject">
                  <Input
                    name="subject"
                    minLength={5}
                    maxLength={120}
                    required
                  />
                </Field>
                <Field label="Details">
                  <Textarea
                    name="detail"
                    minLength={20}
                    maxLength={3000}
                    required
                    placeholder="Explain what happened and what help you need."
                  />
                </Field>
                {complaintForm.config ? <ConfiguredFields config={complaintForm.config} baseKeys={complaintBaseKeys} /> : null}
                {!complaintForm.canSubmit ? <output>{complaintForm.message || 'Loading complaint form…'}</output> : null}
                {complaintError ? (
                  <p
                    role="alert"
                    className="text-sm font-medium text-destructive"
                  >
                    {complaintError}
                  </p>
                ) : null}
                {complaintMessage ? (
                  <output className="block text-sm font-medium text-emerald-700">
                    {complaintMessage}
                  </output>
                ) : null}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={complaintPending || !complaintForm.canSubmit}
                >
                  {complaintPending ? 'Sending…' : 'Send complaint'}
                </Button>
              </div>
            </form>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Label className="block space-y-2">
      <span className="block">{label}</span>
      {children}
    </Label>
  );
}
function CaseStatus({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold capitalize">
      {status.replaceAll('_', ' ')}
    </span>
  );
}
function money(paisa: number) {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

function CustomerReply({ endpoint }: { endpoint: string }) {
  const replyId = useId();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [key, setKey] = useState(newKey);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setPending(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, locale: 'en-NP', idempotencyKey: key }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Reply could not be sent.');
      setKey(newKey());
      setMessage('');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Reply could not be sent.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-4 space-y-2">
      <Label htmlFor={replyId}>Requested information</Label>
      <Textarea
        id={replyId}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        minLength={8}
        maxLength={3000}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        size="sm"
        onClick={() => void submit()}
        disabled={pending || message.trim().length < 8}
      >
        {pending ? 'Sending…' : 'Send reply'}
      </Button>
    </div>
  );
}
