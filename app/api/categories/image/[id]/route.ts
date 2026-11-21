import { publishedTaxonomyImageRequest } from '@/lib/catalog/taxonomy-image-routes';

export const dynamic = 'force-dynamic';

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return publishedTaxonomyImageRequest('category', params);
}
