import { BodyTooLargeError, readBoundedForm } from '@/lib/http/bounded-body';

/** Identity context may expand during URL encoding; protected controls retain their prior bound. */
export async function readIdentityFormBody(request: Request): Promise<FormData> {
  const form = await readBoundedForm(request, 512 * 1024);
  const protectedEntries = new URLSearchParams();
  for (const [name, value] of form) {
    if (typeof value !== 'string') throw new BodyTooLargeError();
    if (!name.startsWith('custom.')) protectedEntries.append(name, value);
  }
  if (new TextEncoder().encode(protectedEntries.toString()).byteLength > 16 * 1024)
    throw new BodyTooLargeError();
  return form;
}
