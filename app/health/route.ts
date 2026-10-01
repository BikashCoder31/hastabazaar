import {env} from 'cloudflare:workers';
import {requireDatabase} from '@/lib/db/d1';
import {inspectReadiness,publicReadinessResponse} from '@/lib/operations/readiness';
export const dynamic='force-dynamic';
export async function GET(){try{const result=await inspectReadiness(requireDatabase(env as unknown as {DB?:D1Database}));return publicReadinessResponse(result.ready);}catch{return publicReadinessResponse(false);}}
