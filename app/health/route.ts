import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {publicReadinessResponse} from '@/lib/operations/readiness';
import {inspectDeploymentReadiness} from '@/lib/operations/deployment-readiness';
import type {SecurityPolicyBindings} from '@/lib/security/runtime-policy';
export const dynamic='force-dynamic';
export async function GET(){try{const result=await inspectDeploymentReadiness(requireDatabase(env as unknown as {DB?:D1Database}),env as unknown as SecurityPolicyBindings);return publicReadinessResponse(result.ready);}catch{return publicReadinessResponse(false);}}
