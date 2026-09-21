import { env } from 'cloudflare:workers';
import { requireDatabase } from '../db/d1';
import { deliverBusinessEmails } from '../operations/business-notifications';
import { deliverOrderEmails, type OrderMailService } from './order-updates';

export async function processEmailOutbox(
  db: D1Database,
  mail: OrderMailService,
  origin: string,
  options: { limit?: number; now?: number } = {},
) {
  const limit = Math.max(1, Math.min(options.limit ?? 12, 40));
  const business = await deliverBusinessEmails(db, mail, origin, {
    limit: Math.min(6, limit),
    now: options.now,
  });
  const businessProcessed =
    business.accepted + business.failed + business.cancelled;
  const remaining = Math.max(0, limit - businessProcessed);
  const orders = remaining
    ? await deliverOrderEmails(db, mail, origin, {
        limit: remaining,
        now: options.now,
      })
    : { sent: 0, failed: 0, cancelled: 0 };
  return Object.freeze({
    business,
    orders,
    processed:
      businessProcessed + orders.sent + orders.failed + orders.cancelled,
  });
}

export async function runScheduledEmailOutbox(options: {
  limit?: number;
  now?: number;
} = {}) {
  const config = env as unknown as {
    DB?: D1Database;
    EMAIL?: OrderMailService & { configured?: boolean };
    APP_ORIGIN?: string;
  };
  if (
    !config.EMAIL ||
    config.EMAIL.configured === false ||
    !config.APP_ORIGIN
  )
    return { pending: true as const, reason: 'email_not_configured' as const };
  return processEmailOutbox(
    requireDatabase(config),
    config.EMAIL,
    config.APP_ORIGIN,
    options,
  );
}
