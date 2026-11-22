export type ProductPreviewSource = 'draft' | 'case' | 'publication';

export function productPreviewPath(id: string, source: ProductPreviewSource, offer?: string) {
  const params = new URLSearchParams();
  if (source !== 'draft') params.set('source', source);
  if (offer) params.set('offer', offer);
  const query = params.toString();
  return `/admin/products/preview/${encodeURIComponent(id)}${query ? `?${query}` : ''}`;
}

export function isProductPreviewPage(path: string) {
  return /^\/admin\/products\/preview\/[A-Za-z0-9_-]{1,160}\/?(?:\?|$)/.test(path);
}
