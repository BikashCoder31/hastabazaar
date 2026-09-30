export type ByteRange = { offset: number; length: number };

/** A single bounded byte range; unsupported units/multipart fall back to full delivery. */
export function parseByteRange(header: string | null, size: number): ByteRange | 'invalid' | null {
  if (header === null) return null;
  if (header.length > 256) return 'invalid';
  if (!header.startsWith('bytes=')) return null;
  if (header.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return 'invalid';
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return 'invalid';
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset) return 'invalid';
  return { offset, length: Math.min(end, size - 1) - offset + 1 };
}

/** Dates and weak validators cannot prove the current bytes; safely send the full object. */
export function matchesIfRange(header: string | null, httpEtag: string): boolean {
  return header === null || (/^"[^"\r\n]*"$/.test(header) && !httpEtag.startsWith('W/') && header === httpEtag);
}
