import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {getPrivateProfileMedia,profileMediaResponse} from '@/lib/sellers/public-profile-media';
import {PublicProfileError} from '@/lib/sellers/public-profile-types';
export async function GET(_request:Request,context:{params:Promise<{id:string;mediaId:string}>}){
 try{const staff=await requireStaffApi('seller.application.review'),{id,mediaId}=await context.params,bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket};
  return profileMediaResponse(requireMediaBucket(bindings),await getPrivateProfileMedia(requireDatabase(bindings),id,mediaId,staff.id,'staff'));
 }catch(error){return new Response(null,{status:error instanceof StaffAuthorizationError||error instanceof PublicProfileError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
