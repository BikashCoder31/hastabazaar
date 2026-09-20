'use client';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminMutation } from '@/components/admin/use-admin-mutation';
export function PayoutRequestActions({ id }: { id: string }) {
  const { send, pending, error } = useAdminMutation();
  const fieldId = useId();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void send('/api/admin/payout-requests/' + encodeURIComponent(id), {
          action: data.get('action'),
          note: data.get('note'),
        });
      }}
      className="mt-4"
    >
      <fieldset
        disabled={pending}
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end"
      >
        <div>
          <Label htmlFor={fieldId + '-action'}>Next action</Label>
          <select
            id={fieldId + '-action'}
            name="action"
            className="mt-2 w-full rounded-lg border bg-background p-2"
          >
            <option value="prepare">Prepare for independent approval</option>
            <option value="reject">Reject request</option>
          </select>
        </div>
        <div>
          <Label htmlFor={fieldId + '-note'}>Review note</Label>
          <Input
            id={fieldId + '-note'}
            name="note"
            className="mt-2"
            required
            minLength={8}
            maxLength={1000}
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? 'Saving…' : 'Save decision'}
        </Button>
      </fieldset>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
