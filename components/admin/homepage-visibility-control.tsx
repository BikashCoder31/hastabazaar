'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '@/lib/forms/submission';
import { clearSessionAttempt, getOrCreateSessionAttempt, hasSessionAttempt, sessionAttemptKey } from '@/lib/forms/client-attempt';

const FORM_ID = 'staff.homepage-visibility';
const BASE_KEYS = ['hidden', 'expectedVersion', 'reason', 'requestId', 'formVersion'];

export function HomepageVisibilityControl({
  productId,
  productName,
  hidden,
  version,
  lastReason,
}: {
  productId: string;
  productName: string;
  hidden: boolean;
  version: number;
  lastReason: string | null;
}) {
  const router = useRouter();
  const catalog = usePublishedFormConfig(FORM_ID);
  const formRef = useRef<HTMLFormElement>(null);
  const fingerprint = useRef<string | null>(null);
  const attemptKey = sessionAttemptKey(FORM_ID, productId);
  const [attemptPresent, setAttemptPresent] = useState(() => hasSessionAttempt(attemptKey));
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const nextHidden = !hidden;

  function prepare() {
    if (!attemptPresent) setReason('');
    setError('');
    setOpen(true);
  }

  async function submit(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (reason.trim().length < 8) {
      setError('Add a clear reason of at least 8 characters.');
      return;
    }
    if (!catalog.canSubmit || !catalog.config || !formRef.current) {
      setError(catalog.message || 'Form configuration is unavailable.'); return;
    }
    setPending(true);
    setError('');
    try {
      const configured = readConfiguredSubmission(formRef.current, catalog.config, BASE_KEYS);
      const payload = { hidden: nextHidden, expectedVersion: version, reason,
        ...configuredJsonPayload(catalog.config, configured.answers, BASE_KEYS) };
      const currentFingerprint = JSON.stringify(payload);
      if (fingerprint.current && fingerprint.current !== currentFingerprint)
        throw new Error('This differs from the prior attempt. Check its outcome, then explicitly start a new attempt.');
      const requestId = getOrCreateSessionAttempt(attemptKey);
      setAttemptPresent(true); fingerprint.current = currentFingerprint;
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productId)}/homepage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, requestId }),
        },
      );
      const result = (await response.json().catch(() => null)) as { hidden?: unknown; version?: unknown; error?: string; code?: string } | null;
      if (result?.code === 'stale_version') catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok)
        throw new Error(result?.error || 'Homepage visibility could not be updated.');
      if (result?.hidden !== nextHidden || !Number.isSafeInteger(result.version) || result.version !== version + 1)
        throw new Error('The response could not confirm this visibility decision. Retry the same attempt.');
      clearSessionAttempt(attemptKey); setAttemptPresent(false); fingerprint.current = null;
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Homepage visibility could not be updated.',
      );
    } finally {
      setPending(false);
    }
  }

  const Icon = hidden ? Eye : EyeOff;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            hidden
              ? 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
              : 'rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary'
          }
        >
          {hidden ? 'Hidden from homepage' : 'Eligible for homepage'}
        </span>
        <Button
          type="button"
          variant={hidden ? 'default' : 'outline'}
          size="sm"
          className="h-auto min-h-9 max-w-full whitespace-normal py-2 text-center"
          onClick={prepare}
        >
          <Icon /> {hidden ? 'Show on homepage' : 'Hide from homepage'}
        </Button>
      </div>
      {lastReason ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Last decision: {lastReason}
        </p>
      ) : null}
      {error && !open ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
        <AlertDialogContent>
          <form ref={formRef} data-form-id={FORM_ID} className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {nextHidden ? 'Hide' : 'Show'} {productName} on the homepage?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {nextHidden
                ? 'The product will leave Offers, Latest, and Top Products. It will remain published in the shop and existing links will continue working.'
                : 'The product can appear again when it qualifies for Offers, Latest, or Top Products.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor={`homepage-reason-${productId}`} className="text-sm font-semibold">
              Decision reason
            </label>
            <Textarea
              id={`homepage-reason-${productId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Record why this product should be hidden or restored."
            />
            <p className="text-xs text-muted-foreground">
              Required. This decision is recorded in the staff audit log.
            </p>
            {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={BASE_KEYS} /> : null}
            {catalog.message ? <p role="alert" className="text-sm text-destructive">{catalog.message}</p> : null}
            {attemptPresent ? <p className="text-xs text-muted-foreground">A prior homepage decision may have succeeded. Retry only identical details, or check the product before starting a new attempt.</p> : null}
            {attemptPresent ? <Button type="button" variant="outline" disabled={pending}
              onClick={() => { if (window.confirm('A homepage decision may already have succeeded. Check the product first. Start a new request reference?')) {
                clearSessionAttempt(attemptKey); setAttemptPresent(false); fingerprint.current = null; setError('');
                if (catalog.status === 'stale') catalog.refresh();
              } }}>Start a new attempt</Button> : null}
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={nextHidden ? 'destructive' : 'default'}
              disabled={pending || !catalog.canSubmit}
              onClick={submit}
            >
              {pending
                ? 'Saving…'
                : nextHidden
                  ? 'Hide from homepage'
                  : 'Show on homepage'}
            </AlertDialogAction>
          </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
