export const productWatermarkPositions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const;
export type ProductWatermarkPolicy = Readonly<{
  enabled: boolean;
  sizePercent: number;
  opacityPercent: number;
  position: (typeof productWatermarkPositions)[number];
}>;
export const defaultProductWatermarkPolicy: ProductWatermarkPolicy = Object.freeze({
  enabled: true, sizePercent: 18, opacityPercent: 28, position: 'bottom-right',
});
export function validateProductWatermarkPolicy(value: unknown): ProductWatermarkPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Product watermark must be an object.');
  const policy = value as Record<string, unknown>;
  const allowed = new Set(['enabled', 'sizePercent', 'opacityPercent', 'position']);
  if (Object.keys(policy).some(key => !allowed.has(key))) throw new RangeError('Product watermark contains an unknown field.');
  if (typeof policy.enabled !== 'boolean') throw new TypeError('Watermark enabled must be true or false.');
  if (!Number.isSafeInteger(policy.sizePercent) || Number(policy.sizePercent) < 8 || Number(policy.sizePercent) > 35)
    throw new RangeError('Watermark width must be a whole percentage from 8 to 35.');
  if (!Number.isSafeInteger(policy.opacityPercent) || Number(policy.opacityPercent) < 10 || Number(policy.opacityPercent) > 80)
    throw new RangeError('Watermark opacity must be a whole percentage from 10 to 80.');
  if (!productWatermarkPositions.includes(policy.position as ProductWatermarkPolicy['position']))
    throw new RangeError('Select a supported watermark corner.');
  return Object.freeze({ enabled: policy.enabled, sizePercent: Number(policy.sizePercent), opacityPercent: Number(policy.opacityPercent), position: policy.position as ProductWatermarkPolicy['position'] });
}
