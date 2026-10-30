import { NextResponse } from 'next/server';
import { currentUser, hashToken, jsonError, SESSION_COOKIE, trustedOrigin } from '@/src/lib/auth';
import { cookies } from 'next/headers';
import { createMembership } from '@/src/models/Membership';
import { setSessionEmpresa } from '@/src/models/RefreshToken';
import { InputError, readBody, textValue } from '@/src/lib/validation';
import { inTransaction } from '@/src/lib/postgres';
import { createEmpresa } from '@/src/models/Empresa';
import { assignFirstEmpresa } from '@/src/models/Usuario';
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Sessão inválida ou expirada.', 401);
  if (user.empresaId) return jsonError('Sua conta já possui um restaurante.', 409);
  try {
    const nome = textValue((await readBody(request)).nomeEmpresa, 'O nome do restaurante');
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    await inTransaction(async transaction => {
      const empresa = await createEmpresa(nome, transaction);
      const updated = await assignFirstEmpresa(user.id, empresa.id, transaction);
      if (!updated) throw new InputError('Sua conta já possui um restaurante.');
      await createMembership(user.id, empresa.id, 'owner', transaction);
      if (!await setSessionEmpresa(hashToken(token || ''), user.id, empresa.id, transaction)) throw new InputError('Sessão expirada. Entre novamente.');
    });
    return NextResponse.json({ message: 'Restaurante criado.' }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof InputError ? error.message : 'Não foi possível criar o restaurante.', error instanceof InputError ? 400 : 500);
  }
}
