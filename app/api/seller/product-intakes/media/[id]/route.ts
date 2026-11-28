import {env} from 'cloudflare:workers';
import {getAuthenticatedUser} from '@/app/auth';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {CategoryContractError} from '@/lib/products/category-contracts';
import {intakeFailure,intakeId,intakeQuery,intakeReply} from '@/lib/products/intake-http';
import {readProductIntakeMedia} from '@/lib/products/intake-media';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{
 const identity = await getAuthenticatedUser({ readOnly: true });
 if (!identity) return intakeReply({ error: 'Sign in to open this private product file.' }, 401);
 const {id}=await context.params,query=intakeQuery(request,['caseId']),caseId=query.get('caseId');if(!intakeId(id)||caseId!==null&&!intakeId(caseId))throw new CategoryContractError('Invalid private file reference.',400);
 const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
 const database = requireDatabase(bindings);
 // The session identifies the sign-in subject; ownership and case access use the account ID.
 const actor = await database.prepare("SELECT id, auth_subject AS authSubject FROM users WHERE auth_subject = ? AND status = 'active' LIMIT 1")
   .bind(identity.userId).first<{ id: string; authSubject: string }>();
 if (!actor || actor.authSubject !== identity.userId) {
   return intakeReply({ error: 'This private product file requires a current account.' }, 403);
 }
 const file = await readProductIntakeMedia(database, requireMediaBucket(bindings), actor.id, id, caseId);
 return new Response(file.body,{headers:{'Content-Type':file.mimeType,'Content-Length':String(file.sizeBytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(error){return intakeFailure(error);}}
