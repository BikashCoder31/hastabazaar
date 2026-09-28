import { readBoundedBody } from './bounded-body';

// A validated answer snapshot may use 128 KiB. Leave a finite envelope for its
// request representation and the separately validated protected action fields.
const FORM_JSON_BODY_BYTES = 256 * 1024;

export async function readBoundedJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const bytes = await readBoundedBody(request, FORM_JSON_BODY_BYTES);
  try {
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new SyntaxError('Invalid JSON request.');
    return value as Record<string, unknown>;
  } catch {
    throw new SyntaxError('Invalid JSON request.');
  }
}
