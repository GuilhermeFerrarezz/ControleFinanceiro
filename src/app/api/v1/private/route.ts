import { NextResponse } from 'next/server';
import { clearSession, currentUser, jsonError } from '@/src/lib/auth';
export async function GET() {
  const user = await currentUser();
  if (!user) return clearSession(jsonError('Sessão inválida ou expirada.', 401));
  // Identity and tenant always come from the server session, never request headers.
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}
