import { NextResponse } from 'next/server';
import { clearSession, currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
// Compatibility endpoint: opaque sessions have a fixed expiry and need no JWT refresh.
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return clearSession(jsonError('Sessão inválida ou expirada.', 401));
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}
