import {env} from 'cloudflare:workers';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {getPublishedProfileMedia,profileMediaResponse} from '@/lib/sellers/public-profile-media';
import {observedFileBucket} from '@/lib/operations/file-access-health';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 const bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket};
 const database=requireDatabase(bindings),media=await getPublishedProfileMedia(database,(await context.params).id);
 return profileMediaResponse(observedFileBucket(database,requireMediaBucket(bindings),'public'),media);
}
