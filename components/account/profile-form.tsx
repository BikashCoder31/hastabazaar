'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendJson } from '@/lib/http/client-request';

export function ProfileForm(props: {
  displayName: string;
  phone: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await sendJson(
        '/api/account/profile',
        'PATCH',
        {
          displayName: data.get('displayName'),
          phone: data.get('phone'),
          locale: 'en-NP',
          idempotencyKey: crypto.randomUUID(),
        },
        'Profile could not be saved.',
      );
      setMessage('Your profile is up to date.');
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Profile could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="customer-form mt-6 grid gap-5 sm:grid-cols-2"
    >
<p className="text-xs text-muted-foreground">* Required field</p>

      <div className="space-y-2">
        <Label htmlFor="displayName">Your name <span aria-hidden="true">*</span></Label>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="name"
          defaultValue={props.displayName}
          minLength={2}
          maxLength={100}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Nepal mobile number</Label>
        <Input
          id="phone"
          name="phone"
          autoComplete="tel"
          defaultValue={props.phone ?? ''}
          type="tel"
          placeholder="98XXXXXXXX"
        />
        <p className="text-sm text-muted-foreground">
          Used to contact you about your orders.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t pt-5 sm:col-span-2">
        <Button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-full px-6"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        {message ? (
          <output className="flex items-center gap-2 text-sm text-primary">
            <Check className="size-4" />
            {message}
          </output>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
