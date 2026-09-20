'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';

/** Preserve the identifier for an unchanged retry after an uncertain response. */
export function useAdminMutation() {
  const router = useRouter();
  const locked = useRef(false);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function send(
    url: string,
    body: Record<string, unknown>,
    key: 'requestId' | 'idempotencyKey' = 'requestId',
    method: 'POST' | 'PUT' = 'POST',
  ) {
    if (locked.current) return false;
    locked.current = true;
    setPending(true);
    setError('');
    try {
      const fingerprint = JSON.stringify({ url, method, body });
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, id: crypto.randomUUID() };
      await sendJson(
        url,
        method,
        { ...body, [key]: attempt.current.id },
        'The action could not be saved. Please try again.',
      );
      attempt.current = null;
      router.refresh();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The action could not be saved.',
      );
      return false;
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return { send, pending, error };
}
