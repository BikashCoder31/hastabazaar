import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {CategoryContractError} from '@/lib/products/category-contracts';
import {getProductIntakeHistory} from '@/lib/products/intake-history';
import {intakeFailure,intakeId,intakeQuery,intakeReply} from '@/lib/products/intake-http';
export async function GET(request:Request){try{
 const owner=await requireSellerCenterApi(),query=intakeQuery(request,['draftId','versionId','beforeRevision']),draftId=query.get('draftId'),versionId=query.get('versionId'),before=query.get('beforeRevision');
 if(!intakeId(draftId)||versionId!==null&&!intakeId(versionId)||before!==null&&!/^\d{1,16}$/.test(before)||versionId!==null&&before!==null)throw new CategoryContractError('Choose one owner draft and one saved-version history request.',400);
 return intakeReply(await getProductIntakeHistory(requireDatabase(env as unknown as {DB?:D1Database}),owner.userId,draftId,{...(versionId?{versionId}:{}),...(before!==null?{beforeRevision:Number(before)}:{})}));
 }catch(error){return error instanceof SellerCenterAuthorizationError?intakeReply({error:error.message},error.status):intakeFailure(error);}}
