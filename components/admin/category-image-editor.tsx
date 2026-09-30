'use client';
import Image from 'next/image';
import { useId, useRef, useState } from 'react';

export function CategoryImageEditor({
  value,
  onChange,
  onBusyChange,
  disabled = false,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const attempt = useRef<{ file: File; requestId: string } | null>(null);
  async function upload(file: File, retry = false) {
    if (busy || disabled) return;
    setError('');
    setCanRetry(false);
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size === 0 ||
      file.size > 8 * 1024 * 1024
    ) {
      setError('Choose a JPG, PNG or WebP image up to 8 MB.');
      return;
    }
    if (!retry || !attempt.current)
      attempt.current = { file, requestId: crypto.randomUUID() };
    const current = attempt.current;
    setBusy(true);
    onBusyChange(true);
    try {
      const body = new FormData();
      body.set('file', current.file);
      body.set('requestId', current.requestId);
      const response = await fetch('/api/admin/catalog/category-media', {
        method: 'POST',
        body,
      });
      const result = (await response.json().catch(() => null)) as {
        media?: { id?: unknown };
        error?: string;
      } | null;
      if (!response.ok)
        throw Error(
          result?.error || 'The category image could not be uploaded.',
        );
      if (typeof result?.media?.id !== 'string' || !result.media.id)
        throw Error('The upload could not be confirmed. Retry the same image.');
      onChange(result.media.id);
      attempt.current = null;
    } catch (cause) {
      setCanRetry(true);
      setError(
        cause instanceof Error
          ? cause.message
          : 'The category image could not be uploaded.',
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <fieldset
      className="space-y-3 rounded-xl border bg-background p-4 sm:col-span-2"
      disabled={disabled || busy}
    >
      <legend className="px-1 text-sm font-semibold">
        Category image{' '}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </legend>
      {value ? (
        <Image
          data-media-mode="cover"
          unoptimized
          src={`/api/admin/catalog/category-media/${encodeURIComponent(value)}`}
          alt="Category image preview"
          width={160}
          height={160}
          className="size-32 rounded-xl border object-cover"
        />
      ) : null}
      <label htmlFor={id} className="block text-sm font-medium">
        {value ? 'Replace category image' : 'Upload category image'}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-describedby={`${id}-help`}
        className="block w-full min-w-0 text-sm"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void upload(file);
        }}
      />
      <p id={`${id}-help`} className="text-sm leading-6 text-muted-foreground">
        JPG, PNG or WebP, up to 8 MB. Preview your image here, then select Save
        entry to publish the change. Removing an image restores the default
        artwork or placeholder.
      </p>
      {value ? (
        <button
          type="button"
          className="min-h-11 text-sm font-semibold text-destructive underline"
          onClick={() => {
            attempt.current = null;
            setCanRetry(false);
            setError('');
            onChange(null);
          }}
        >
          Remove image
        </button>
      ) : null}
      {busy ? (
        <output className="block text-sm">Uploading image...</output>
      ) : null}
      {error ? (
        <div role="alert" className="text-sm text-destructive">
          <p>{error}</p>
          {canRetry ? (
            <button
              type="button"
              className="min-h-11 underline"
              onClick={() => {
                if (attempt.current) void upload(attempt.current.file, true);
              }}
            >
              Retry image upload
            </button>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
