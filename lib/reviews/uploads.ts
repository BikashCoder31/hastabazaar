import {readBoundedForm} from '../http/bounded-body';
import {
  validateProductImage,
  validateProductImageContent,
} from '../products/submission';
export const maximumReviewBytes = 16 * 1024 * 1024;
export async function validateReviewPhotos(files: readonly File[]) {
  if (files.length > 3) return 'Add up to three photos.';
  for (const file of files) {
    const error =
      validateProductImage(file) ?? (await validateProductImageContent(file));
    if (error) return error;
  }
  return null;
}
export async function readReviewForm(request: Request) {
 return readBoundedForm(request,maximumReviewBytes);
}
