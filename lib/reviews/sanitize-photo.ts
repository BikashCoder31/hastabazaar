import {sharp} from './image-processor';
export class InvalidReviewPhotoError extends Error {}
// Re-encode, orient, resize and strip metadata. Never persist original customer bytes.
export async function sanitizeReviewPhoto(file: File): Promise<File> {
 try {
  const input=Buffer.from(await file.arrayBuffer());
  const image=sharp(input,{limitInputPixels:20_000_000,failOn:'warning',animated:false});
  const metadata=await image.metadata();
  if(!metadata.width||!metadata.height||(metadata.pages??1)>1||!['jpeg','png','webp'].includes(metadata.format??'')) throw new Error('Invalid image');
  const bytes=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  if(bytes.byteLength>5*1024*1024) throw new Error('Image too large');
  return new File([new Uint8Array(bytes)],'customer-review.webp',{type:'image/webp'});
 } catch {throw new InvalidReviewPhotoError('Use a valid JPG, PNG or WebP photo of at most 20 megapixels. Animated images are not supported.');}
}

