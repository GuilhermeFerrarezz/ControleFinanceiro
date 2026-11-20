import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { db } from '@/src/lib/db';

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    const user = await currentUser();
    if (!user) return jsonError('Entre na sua conta para continuar.', 401);
    await db.query('UPDATE usuarios SET tutorial_completed_at=coalesce(tutorial_completed_at,clock_timestamp()) WHERE id=$1 AND ativo', [user.id]);
    return NextResponse.json({ message: 'Preferência salva.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return jsonError('Não foi possível salvar a preferência do tutorial.', 500); }
}
