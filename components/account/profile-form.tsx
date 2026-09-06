'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ProfileForm(props: {
  displayName: string;
  phone: string | null;
  locale: 'en-NP' | 'ne-NP';
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    const response = await fetch('/api/account/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        displayName: data.get('displayName'),
        phone: data.get('phone'),
        locale: data.get('locale'),
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setSaving(false);
    setMessage(
      response.ok
        ? 'Profile saved.'
        : result.error || 'Profile could not be saved.',
    );
    if (response.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={props.displayName}
          minLength={2}
          maxLength={100}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Nepal mobile</Label>
        <Input
          id="phone"
          name="phone"
          defaultValue={props.phone ?? ''}
          type="tel"
          placeholder="98XXXXXXXX"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="locale">Preferred language</Label>
        <select
          id="locale"
          name="locale"
          defaultValue={props.locale}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          <option value="en-NP">English</option>
          <option value="ne-NP">नेपाली</option>
        </select>
      </div>
      <div className="flex items-end gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
        {message ? (
          <output className="text-sm text-muted-foreground">
            {message}
          </output>
        ) : null}
      </div>
    </form>
  );
}
