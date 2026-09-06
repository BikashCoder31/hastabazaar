'use client';

import { CircleAlert, FileImage, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ComplaintRow } from '@/lib/db/repositories/complaints';
import type { ReturnCaseRow } from '@/lib/db/repositories/returns';

interface ReceiptItem {
  id: string;
  productName: string;
  sellerName: string;
  quantity: number;
  returnEligible: boolean;
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
  const [returnKey, setReturnKey] = useState(newKey);
  const [complaintKey, setComplaintKey] = useState(newKey);
  const [returnPending, setReturnPending] = useState(false);
  const [complaintPending, setComplaintPending] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [complaintError, setComplaintError] = useState('');
  const [returnMessage, setReturnMessage] = useState('');
  const [complaintMessage, setComplaintMessage] = useState('');

  async function submitReturn(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setReturnPending(true);
    setReturnError('');
    setReturnMessage('');
    const form = new FormData(formElement);
    form.set('idempotencyKey', returnKey);
    try {
      const response = await fetch(
        `/orders/${encodeURIComponent(orderNumber)}/returns`,
        { method: 'POST', body: form },
      );
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Return request could not be sent.');
      setReturnMessage(result.message || 'Return request received.');
      setReturnKey(newKey());
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
    setComplaintPending(true);
    setComplaintError('');
    setComplaintMessage('');
    const form = new FormData(formElement);
    try {
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
            idempotencyKey: complaintKey,
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.error || 'Complaint could not be sent.');
      setComplaintMessage(result.message || 'Complaint received.');
      setComplaintKey(newKey());
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
    <section className="mt-8 border-t pt-8" aria-labelledby="aftercare-title">
      <p className="eyebrow">Returns and support</p>
      <h2 id="aftercare-title" className="mt-2 font-heading text-3xl">
        Help after your order
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
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
                  Refund: {money(item.refundAmountPaisa)} ·{' '}
                  {item.refundStatus?.replaceAll('_', ' ')}
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

      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={submitReturn}
          className="rounded-2xl border bg-card p-5 sm:p-6"
        >
          <div className="flex items-center gap-2">
            <RotateCcw className="size-5 text-primary" />
            <h3 className="font-heading text-2xl">Request a return</h3>
          </div>
          {orderStatus !== 'delivered' ? (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Return requests become available after delivery is confirmed.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              <Field label="Item">
                <select
                  name="orderItemId"
                  required
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  {items.map((item) => (
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
                    name="quantity"
                    type="number"
                    min={1}
                    max={Math.max(...items.map((item) => item.quantity))}
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
              <input type="hidden" name="locale" value="en-NP" />
              <Field label="Photos or evidence (optional, up to 5)">
                <Input
                  name="evidence"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  multiple
                />
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <FileImage className="size-3.5" /> JPG, PNG, WebP, or PDF · 5
                  MB each. Missing photos do not automatically invalidate a
                  statutory claim.
                </p>
              </Field>
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
              <Button type="submit" disabled={returnPending}>
                {returnPending ? 'Sending…' : 'Send return request'}
              </Button>
            </div>
          )}
        </form>

        <form
          onSubmit={submitComplaint}
          className="rounded-2xl border bg-card p-5 sm:p-6"
        >
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
                <option value="service">Hathkriti service</option>
                <option value="safety">Safety or urgent concern</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Subject">
              <Input name="subject" minLength={5} maxLength={120} required />
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
            {complaintError ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {complaintError}
              </p>
            ) : null}
            {complaintMessage ? (
              <output className="block text-sm font-medium text-emerald-700">
                {complaintMessage}
              </output>
            ) : null}
            <Button type="submit" variant="outline" disabled={complaintPending}>
              {complaintPending ? 'Sending…' : 'Send complaint'}
            </Button>
          </div>
        </form>
      </div>
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
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
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
      <Label>Requested information</Label>
      <Textarea
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
