import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { deliverOrderEmails, type OrderMailService } from './order-updates';
export async function sendPendingOrderUpdates(
  options: { orderId?: string; orderNumber?: string; jobId?: string; limit?: number } = {},
) {
  try {
    const config = env as unknown as {
      DB?: D1Database;
      EMAIL?: OrderMailService;
      APP_ORIGIN?: string;
    };
    if (!config.EMAIL || !config.APP_ORIGIN)
      return { sent: 0, failed: 0, pending: true };
    return await deliverOrderEmails(
      requireDatabase(config),
      config.EMAIL,
      config.APP_ORIGIN,
      options,
    );
  } catch {
    return { sent: 0, failed: 0, pending: true };
  }
}
