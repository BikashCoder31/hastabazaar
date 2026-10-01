'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { useAdminMutation } from '@/components/admin/use-admin-mutation';

export function PrivacyActions({
  id,
  canDecide,
  status,
}: {
  id: string;
  canDecide: boolean;
  status: string;
}) {
  const { send, pending, error } = useAdminMutation();
  const [action, setAction] = useState('assign');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
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
  if (status === 'completed' || status === 'rejected')
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        This request is closed. Its records remain retained.
      </p>
    );
  return (
    <div className="mt-5">
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
    </div>
  );
}
