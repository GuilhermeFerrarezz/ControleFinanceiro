import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { clearSession, jsonError, revokeSession, SESSION_COOKIE, trustedOrigin } from '@/src/lib/auth';
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    await revokeSession((await cookies()).get(SESSION_COOKIE)?.value);
    return clearSession(NextResponse.json({ message: 'Logout realizado.' }, { headers: { 'Cache-Control': 'no-store' } }));
  } catch { return jsonError('Não foi possível encerrar a sessão. Tente novamente.', 500); }
}
