import { validAuthToken } from '@/src/models/AuthToken';
import { completeTokenRoute } from '@/src/lib/auth-token-routes';
// GET opens the confirmation screen; only an explicit POST consumes the token,
// so email security scanners and link prefetches cannot use it accidentally.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const location = validAuthToken(token) ? `/verify-email#token=${token}` : '/verify-email';
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) { return completeTokenRoute(request, 'email_verification'); }
