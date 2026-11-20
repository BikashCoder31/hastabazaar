import {env} from 'cloudflare:workers';
import {getAuthenticatedUser} from '@/app/auth';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {CategoryContractError} from '@/lib/products/category-contracts';
import {intakeFailure,intakeId,intakeQuery,intakeReply} from '@/lib/products/intake-http';
import {readProductIntakeMedia} from '@/lib/products/intake-media';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{
 const actor=await getAuthenticatedUser();if(!actor)return intakeReply({error:'Sign in to open this private product file.'},401);
 const {id}=await context.params,query=intakeQuery(request,['caseId']),caseId=query.get('caseId');if(!intakeId(id)||caseId!==null&&!intakeId(caseId))throw new CategoryContractError('Invalid private file reference.',400);
 const bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket},file=await readProductIntakeMedia(requireDatabase(bindings),requireMediaBucket(bindings),actor.userId,id,caseId);
 return new Response(file.body,{headers:{'Content-Type':file.mimeType,'Content-Length':String(file.sizeBytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(error){return intakeFailure(error);}}
