'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function ReviewForm({
  productId,
  orderItemId,
  orderNumber,
}: {
  productId: string;
  orderItemId: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orderItemId,
        rating: Number(data.get('rating')),
        title: data.get('title'),
        body: data.get('body'),
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    setMessage(
      response.ok
        ? 'Thank you. Your verified-purchase review is awaiting moderation.'
        : result.error || 'Review could not be submitted.',
    );
    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }
  return (
    <form
      onSubmit={submit}
      className="mt-5 grid gap-4 rounded-2xl border bg-card p-5"
    >
      <p className="text-sm text-muted-foreground">
        Delivered order {orderNumber}
      </p>
      <div className="space-y-2">
        <Label htmlFor="rating">Rating</Label>
        <select
          id="rating"
          name="rating"
          defaultValue="5"
          className="h-10 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="5">5 — Excellent</option>
          <option value="4">4 — Good</option>
          <option value="3">3 — Okay</option>
          <option value="2">2 — Poor</option>
          <option value="1">1 — Very poor</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="review-title">Title (optional)</Label>
        <Input id="review-title" name="title" maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="review-body">Your review</Label>
        <Textarea
          id="review-body"
          name="body"
          minLength={10}
          maxLength={2000}
          required
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit review'}
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
