export class HttpResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HttpResponseError';
  }
}

/** Parse mutation responses without leaving forms pending after network failures. */
export async function sendJson<T = Record<string, unknown>>(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body: unknown,
  fallbackMessage: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      'We couldn’t connect. Check your connection and try again.',
    );
  }
  const result = (await response.json().catch(() => null)) as
    | (T & { error?: unknown })
    | null;
  const message = typeof result?.error === 'string' ? result.error : fallbackMessage;
  if (!response.ok) throw new HttpResponseError(message, response.status);
  if (result === null) throw new Error(message);
  return result;
}
