import { env } from 'cloudflare:workers';
import { StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { requireAccountingApiReader } from '@/lib/accounting/access';
import {
  AccountingValidationError,
  parseAccountingQuery,
} from '@/lib/accounting/filters';
import { getAccountingWorkspace } from '@/lib/accounting/workspace';
import { accountingEnvironment } from '@/lib/accounting/environment';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAccountingApiReader();
    const now = Date.now();
    const query = parseAccountingQuery(new URL(request.url).searchParams, now);
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    return json(
      await getAccountingWorkspace(
        database,
        query,
        now,
        accountingEnvironment(env),
      ),
    );
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof AccountingValidationError)
      return json({ error: error.message }, 400);
    return json(
      {
        error:
          'Accounting is unavailable. Reload or review source readiness. No financial data was changed.',
      },
      503,
    );
  }
}
