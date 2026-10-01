'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminMutation } from '@/components/admin/use-admin-mutation';
export function ReviewModerationActions({
  id,
  status,
  replyVersion,
}: {
  id: string;
  status: string;
  replyVersion?: number;
}) {
  const { send, pending, error } = useAdminMutation();
  const [note, setNote] = useState('');
  const fieldId = useId();
  async function act(action: 'publish' | 'reject' | 'hide') {
    if (
      await send(
        '/api/admin/reviews/' +
          encodeURIComponent(id) +
          (replyVersion ? '/reply' : ''),
        { action, note, ...(replyVersion ? { version: replyVersion } : {}) },
        'idempotencyKey',
      )
    )
      setNote('');
  }
  if (status !== 'pending' && status !== 'published')
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No moderation action is available at this stage.
      </p>
    );
  return (
    <fieldset disabled={pending} className="mt-4">
      <Label htmlFor={fieldId}>Moderation note</Label>
      <Input
        id={fieldId}
        className="mt-2"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        minLength={8}
        maxLength={1000}
        placeholder="Explain the decision for the audit record."
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'pending' ? (
          <>
            <Button
              size="sm"
              disabled={pending || note.trim().length < 8}
              onClick={() => void act('publish')}
            >
              Publish {replyVersion ? 'reply' : 'review'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || note.trim().length < 8}
              onClick={() => void act('reject')}
            >
              Reject {replyVersion ? 'reply' : 'review'}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || note.trim().length < 8}
            onClick={() => void act('hide')}
          >
            Hide {replyVersion ? 'reply' : 'review'}
          </Button>
        )}
      </div>
    </fieldset>
  );
}
