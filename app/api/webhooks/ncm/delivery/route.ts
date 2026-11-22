import { env } from 'cloudflare:workers';
import { after } from 'next/server';
import { receiveNcmWebhook, type NcmWebhookBindings } from '@/lib/delivery/ncm-events';

export async function POST(request: Request) {
  return receiveNcmWebhook(request, 'delivery', env as unknown as NcmWebhookBindings, after);
}
