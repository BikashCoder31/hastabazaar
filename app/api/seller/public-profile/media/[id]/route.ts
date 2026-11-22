import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {getPrivateProfileMedia,profileMediaResponse} from '@/lib/sellers/public-profile-media';
import {PublicProfileError} from '@/lib/sellers/public-profile-types';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 try{const owner=await requireSellerCenterApi();if(!owner.sellerId)return new Response(null,{status:404});const bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket};
  return profileMediaResponse(requireMediaBucket(bindings),await getPrivateProfileMedia(requireDatabase(bindings),owner.sellerId,(await context.params).id,owner.userId,'owner'));
 }catch(error){return new Response(null,{status:error instanceof SellerCenterAuthorizationError||error instanceof PublicProfileError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
