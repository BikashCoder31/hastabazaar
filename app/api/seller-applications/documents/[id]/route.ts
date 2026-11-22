import { env } from 'cloudflare:workers';
import { requireSellerCenterApi, SellerCenterAuthorizationError } from '@/lib/auth/seller-center';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { evidenceFileDisposition } from '@/lib/http/content-disposition';

export async function GET(_request:Request,context:{params:Promise<{id:string}>}) {
  const reply=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
  try {
    const viewer=await requireSellerCenterApi(),bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket};
    const document=await requireDatabase(bindings).prepare(`SELECT d.object_key AS objectKey,d.original_name AS originalName,d.mime_type AS mimeType
      FROM seller_documents d JOIN seller_profiles s ON s.id=d.seller_id JOIN users u ON u.id=s.user_id
      WHERE d.id=? AND s.user_id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller'))`)
      .bind((await context.params).id,viewer.userId).first<{objectKey:string;originalName:string;mimeType:string}>();
    if(!document) return reply('Document not found.',404);
    const object=await requireMediaBucket(bindings).get(document.objectKey); if(!object) return reply('Document file is unavailable.',404);
    const mime=['application/pdf','image/jpeg','image/png'].includes(document.mimeType)?document.mimeType:'application/octet-stream';
    return new Response(object.body,{headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie','Content-Type':mime,
      'Content-Disposition':evidenceFileDisposition(document.originalName,mime),'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"}});
  } catch(error) { return reply(error instanceof SellerCenterAuthorizationError?error.message:'Document could not be opened.',error instanceof SellerCenterAuthorizationError?error.status:503); }
}
