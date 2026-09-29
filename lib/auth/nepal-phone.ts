/** Canonical account/buyer SMS destination. Delivery recipients remain independent. */
export function normalizeNepalMobile(
  value: string | null | undefined,
): string | null {
  const match = /^(?:\+?977)?(9[678]\d{8})$/.exec(
    (value ?? '').trim().replace(/[\s()-]/g, ''),
  );
  return match ? `+977${match[1]}` : null;
}
