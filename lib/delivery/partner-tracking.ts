import { safeCourierUrl } from './validation';

const token = '{number}';
const marker = 'hb-tracking-marker';
const invalidPattern = 'Enter a public HTTPS tracking link with {number} once in the path or query.';

export function validatePartnerTrackingPattern(value: string) {
  const pattern = value.trim();
  if (!pattern) return null;
  const [before, after, extra] = pattern.split(token);
  if (after === undefined || extra !== undefined || /[{}\\\s]/.test(before + after) || pattern.length > 500)
    throw new Error(invalidPattern);
  try {
    const url = new URL(safeCourierUrl(before + marker + after));
    if (!url.pathname.includes(marker) && !url.search.includes(marker)) throw new Error(invalidPattern);
    if (url.host.includes(marker) || url.hash.includes(marker)) throw new Error(invalidPattern);
    return pattern;
  } catch {
    throw new Error(invalidPattern);
  }
}

export function partnerTrackingUrl(pattern: string | null, trackingNumber: string) {
  if (!pattern || !trackingNumber.trim()) return null;
  try {
    const valid = validatePartnerTrackingPattern(pattern);
    return valid ? safeCourierUrl(valid.replace(token, encodeURIComponent(trackingNumber))) : null;
  } catch {
    return null;
  }
}
