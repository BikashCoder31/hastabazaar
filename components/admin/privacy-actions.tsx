'use client';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { useAdminMutation } from '@/components/admin/use-admin-mutation';
import { HttpResponseError, sendJson } from '@/lib/http/client-request';

export function PrivacyActions({
  id,
  canDecide,
  status,
  requestType,
  assignedToCurrentStaff,
}: {
  id: string;
  canDecide: boolean;
  status: string;
  requestType: string;
  assignedToCurrentStaff: boolean;
}) {
  const { send, pending, error } = useAdminMutation();
  const [action, setAction] = useState('assign');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportDone, setExportDone] = useState(false);
  const exportAttempt = useRef<string | null>(null);
  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [eraseDone, setEraseDone] = useState(false);
  const fieldId = useId();
  async function save() {
    setDone(false);
    if (
      await send('/api/admin/privacy/' + encodeURIComponent(id), {
        action,
        note,
      })
    ) {
      setNote('');
      setConfirm(false);
      setDone(true);
    }
  }
  async function exportAnswers() {
    if (exportPending) return;
    setExportPending(true);
    setExportError('');
    setExportDone(false);
    exportAttempt.current ??= crypto.randomUUID();
    try {
      const result = await sendJson<{ answers: unknown[] }>(
        '/api/admin/privacy/' + encodeURIComponent(id), 'POST',
        { action: 'export_answers', requestId: exportAttempt.current },
        'The form-answer export could not be prepared.',
      );
      const blob = new Blob([JSON.stringify({ formAnswers: result.answers }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `form-answers-${id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      exportAttempt.current = null;
      setExportDone(true);
    } catch (cause) {
      if (cause instanceof HttpResponseError && cause.status === 409)
        exportAttempt.current = null;
      setExportError(cause instanceof Error ? cause.message : 'The export could not be prepared.');
    } finally { setExportPending(false); }
  }
  async function eraseAnswers() {
    setEraseDone(false);
    if (await send('/api/admin/privacy/' + encodeURIComponent(id), { action: 'erase_answers' })) {
      setEraseConfirm(false);
      setEraseDone(true);
    }
  }
  if (status === 'completed' || status === 'rejected')
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        This request is closed. Its records remain retained.
      </p>
    );
  return (
    <div className="mt-5">
      {status === 'approved' && assignedToCurrentStaff && requestType === 'access' ? (
        <div className="mb-5 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Prepare a JSON copy of the customer’s stored form answers. This action does not close the request.</p>
          <Button className="mt-3" type="button" disabled={exportPending} onClick={() => void exportAnswers()}>
            {exportPending ? 'Preparing…' : 'Export form answers'}
          </Button>
          {exportError ? <p role="alert" className="mt-2 text-sm text-destructive">{exportError}</p> : null}
          {exportDone ? <output className="mt-2 block text-sm">Form-answer export prepared. Request status is unchanged.</output> : null}
        </div>
      ) : null}
      {status === 'approved' && assignedToCurrentStaff && requestType === 'deletion' && canDecide ? (
        <div className="mb-5 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Erase eligible account-profile answer history after confirming retention and legal holds. Linked seller, rider, order, and case records remain. This action does not close the request.</p>
          <Button type="button" variant="destructive" disabled={pending} onClick={() => setEraseConfirm(true)}>Erase profile answers</Button>
          {eraseDone ? <output className="mt-2 block text-sm">Eligible profile answers erased. Other linked records and request status are unchanged.</output> : null}
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (['approve', 'reject', 'complete'].includes(action))
            setConfirm(true);
          else void save();
        }}
      >
        <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={fieldId + '-action'}>Next action</Label>
            <select
              id={fieldId + '-action'}
              className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              <option value="assign">Assign for investigation</option>
              <option value="request_information">
                Request more information
              </option>
              {canDecide ? (
                <>
                  <option value="approve">Approve request</option>
                  <option value="reject">Reject request</option>
                  <option value="complete">Record completion</option>
                </>
              ) : null}
            </select>
          </div>
          <div>
            <Label htmlFor={fieldId + '-note'}>
              Investigation or decision note
            </Label>
            <Textarea
              id={fieldId + '-note'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required
              minLength={8}
              maxLength={2000}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending || note.trim().length < 8}>
              {pending ? 'Saving…' : 'Save decision'}
            </Button>
          </div>
        </fieldset>
      </form>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Recording approval or completion does not automatically export, correct,
        or delete data. Document the actual work and any retained records in
        your note.
      </p>
      {error && !confirm ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {done ? (
        <output className="block mt-3 text-sm">Decision recorded.</output>
      ) : null}
      <ConfirmOperation
        open={confirm}
        onOpenChange={setConfirm}
        title="Record this privacy decision?"
        description="Confirm that the decision and note accurately describe the reviewed request and any work performed. The event is retained in the request history."
        pending={pending}
        error={error}
        onConfirm={() => void save()}
      />
      <ConfirmOperation
        open={eraseConfirm}
        onOpenChange={setEraseConfirm}
        title="Erase eligible profile answers?"
        description="This erases only the customer’s saved account-profile answers after the server checks the approved request and stored legal hold. Other linked records and request status will not change."
        pending={pending}
        error={error}
        onConfirm={() => void eraseAnswers()}
      />
    </div>
  );
}
