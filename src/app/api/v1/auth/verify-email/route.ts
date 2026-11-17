import { NextResponse } from 'next/server';
import { completeTokenRoute } from '@/src/lib/auth-token-routes';
// GET opens the confirmation screen; only an explicit POST consumes the token,
// so email security scanners and link prefetches cannot use it accidentally.
export async function GET(request: Request) {
  const destination = new URL('/verify-email', request.url);
  destination.searchParams.set('token', new URL(request.url).searchParams.get('token') || '');
  return NextResponse.redirect(destination, { status: 303, headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) { return completeTokenRoute(request, 'email_verification'); }
