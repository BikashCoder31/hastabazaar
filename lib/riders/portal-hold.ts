export const riderPortalHoldMessage =
  'Rider applications and the rider dashboard are temporarily unavailable.';

export function riderPortalHoldResponse(): Response {
  return Response.json(
    { error: riderPortalHoldMessage, code: 'rider_program_on_hold' },
    { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
