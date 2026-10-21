import { handleSecurityAction } from '@/lib/security/controller';
export async function POST(request: Request) {
  return handleSecurityAction(request, 'disable');
}
