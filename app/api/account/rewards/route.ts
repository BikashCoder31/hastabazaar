import { env } from 'cloudflare:workers';
import {
  requireExistingCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getRewards } from '@/lib/db/repositories/loyalty';
import { IncentiveError } from '@/lib/incentives/types';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
export async function GET(request: Request) {
  try {
    const customer = await requireExistingCustomerApi();
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some(
        (key) =>
          !['cursor', 'limit'].includes(key) || params.getAll(key).length !== 1,
      )
    )
      throw new IncentiveError('invalid');
    const rawLimit = params.get('limit');
    if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit))
      throw new IncentiveError('invalid');
    return json(
      await getRewards(
        requireDatabase(env as unknown as { DB?: D1Database }),
        customer.userId,
        Date.now(),
        params.get('cursor') ?? undefined,
        rawLimit === null ? undefined : Number(rawLimit),
        customer.authSubject,
      ),
    );
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof IncentiveError)
      return json(
        { error: error.message, code: error.code },
        error.code === 'unauthorized'
          ? 403
          : error.code === 'invalid'
            ? 400
            : 409,
      );
    return json({ error: 'Rewards could not be loaded.' }, 500);
  }
}
