'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CustomerAddressRow } from '@/lib/db/repositories/customers';
import { NEPAL_PROVINCES } from '@/lib/checkout/validation';

export function AddressManager({
  addresses,
}: {
  addresses: readonly CustomerAddressRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomerAddressRow | null | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const address = Object.fromEntries(data.entries());
    const url = editing?.id
      ? `/api/account/addresses/${editing.id}`
      : '/api/account/addresses';
    const response = await fetch(url, {
      method: editing?.id ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        address: { ...address, isDefault: data.get('isDefault') === 'on' },
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok)
      return setError(result.error || 'Address could not be saved.');
    setEditing(undefined);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/account/addresses/${id}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok)
      return setError(result.error || 'Address could not be deleted.');
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Delivery book</p>
          <h1 className="mt-2 font-heading text-4xl">Saved addresses</h1>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus /> Add address
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {editing !== undefined ? (
        <form onSubmit={save} className="mt-7 rounded-2xl border bg-card p-6">
          <div className="flex justify-between gap-4">
            <h2 className="font-heading text-2xl">
              {editing ? 'Edit address' : 'New address'}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditing(undefined)}
              aria-label="Close form"
            >
              <X />
            </Button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              name="label"
              label="Label"
              defaultValue={editing?.label ?? ''}
              placeholder="Home or Office"
              required
            />
            <Field
              name="recipientName"
              label="Recipient name"
              defaultValue={editing?.recipientName ?? ''}
              required
            />
            <Field
              name="phone"
              label="Recipient phone"
              defaultValue={editing?.phone ?? ''}
              placeholder="98XXXXXXXX"
              required
            />
            <div className="space-y-2">
              <Label htmlFor="province">Province</Label>
              <select
                id="province"
                name="province"
                defaultValue={editing?.province ?? 'Madhesh'}
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              >
                {NEPAL_PROVINCES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <Field
              name="district"
              label="District"
              defaultValue={editing?.district ?? ''}
              required
            />
            <Field
              name="municipality"
              label="Municipality / rural municipality"
              defaultValue={editing?.municipality ?? ''}
              required
            />
            <Field
              name="ward"
              label="Ward"
              defaultValue={editing?.ward ?? ''}
            />
            <Field
              name="locality"
              label="Street, tole or locality"
              defaultValue={editing?.locality ?? ''}
              required
            />
            <Field
              name="landmark"
              label="Landmark"
              defaultValue={editing?.landmark ?? ''}
            />
            <Field
              name="postalCode"
              label="Postal code"
              defaultValue={editing?.postalCode ?? ''}
            />
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={Boolean(editing?.isDefault)}
                className="size-4 accent-primary"
              />{' '}
              Use as default
            </label>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save address'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}
      {addresses.length ? (
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {addresses.map((address) => (
            <article
              key={address.id}
              className="rounded-2xl border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <MapPin className="mt-1 size-5 text-primary" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{address.label}</h2>
                      {address.isDefault ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {address.recipientName} · {address.phone}
                      <br />
                      {address.locality}
                      {address.landmark ? `, near ${address.landmark}` : ''}
                      <br />
                      {address.municipality}, {address.district},{' '}
                      {address.province}
                    </p>
                  </div>
                </div>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(address)}
                    aria-label={`Edit ${address.label}`}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void remove(address.id)}
                    disabled={busy}
                    aria-label={`Delete ${address.label}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Save a delivery address for faster checkout.
        </div>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  ...props
}: { name: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
