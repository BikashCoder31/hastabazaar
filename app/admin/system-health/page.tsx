import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {formHealthRuntimeScope} from '@/lib/operations/form-health';
import {readSystemHealthWorkspace} from '@/lib/operations/system-health-workspace';
import {SystemHealthWorkspace} from '@/components/admin/system-health-workspace';
import {readEmailHealthRuntimeConfig} from '@/lib/operations/email-delivery-overview';
import {safeAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function SystemHealthPage(props?:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){const query=await(props?.searchParams??Promise.resolve({} as Record<string,string|string[]|undefined>)),actor=await requireStaffPage('/admin/system-health','system.health.view');const bindings=env as unknown as Record<string,string|undefined>,scope=formHealthRuntimeScope(bindings),email=readEmailHealthRuntimeConfig(bindings,scope.now),raw=bindings.SYSTEM_HEALTH_EXPECTED_SINCE,expected=raw&&/^\d+$/.test(raw)?Number(raw):NaN;return <SystemHealthWorkspace returnTo={safeAdminReturnTo(query.returnTo)} overview={await readSystemHealthWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,{...scope,expectedSince:email.expectedSince,systemExpectedSince:Number.isSafeInteger(expected)&&expected>0&&expected<=scope.now?expected:null})}/>;}
