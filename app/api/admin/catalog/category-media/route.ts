import { uploadTaxonomyImageRequest } from '@/lib/catalog/taxonomy-image-routes';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return uploadTaxonomyImageRequest(request, 'category');
}
