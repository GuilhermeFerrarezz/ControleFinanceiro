import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { db } from '@/src/lib/db';
import { InputError, readBody } from '@/src/lib/validation';

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  try {
    const user = await currentUser();
    if (!user) return jsonError('Entre na sua conta para continuar.', 401);
    const body = request.body ? await readBody(request) : {};
    if (body.mode !== undefined && body.mode !== 'start') throw new InputError('Operação inválida.');
    if (body.mode === 'start') {
      // Claim the first display once per account, including concurrent tabs.
      const result = await db.query(`UPDATE usuarios SET tutorial_completed_at=clock_timestamp()
        WHERE id=$1 AND ativo AND tutorial_completed_at IS NULL RETURNING id`, [user.id]);
      return NextResponse.json({ showTutorial: result.rowCount === 1 }, { headers: { 'Cache-Control': 'no-store' } });
    }
    await db.query('UPDATE usuarios SET tutorial_completed_at=coalesce(tutorial_completed_at,clock_timestamp()) WHERE id=$1 AND ativo', [user.id]);
    return NextResponse.json({ message: 'Preferência salva.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error instanceof InputError ? error.message : 'Não foi possível salvar a preferência do tutorial.', error instanceof InputError ? 400 : 500); }
}
