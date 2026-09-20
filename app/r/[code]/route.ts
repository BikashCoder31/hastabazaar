export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z0-9]{16}$/.test(code))
    return new Response('Invitation not found.', { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/referral-terms',
      'Cache-Control': 'no-store',
      'Set-Cookie': `hastabazaar_referral=${code}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure`,
    },
  });
}
