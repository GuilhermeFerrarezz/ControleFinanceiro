import { NextResponse } from 'next/server';
import { currentUser, hashToken, jsonError, SESSION_COOKIE, trustedOrigin } from '@/src/lib/auth';
import { cookies } from 'next/headers';
import { createMembership, findMembership } from '@/src/models/Membership';
import { setSessionEmpresa } from '@/src/models/RefreshToken';
import { InputError, passwordValue, readBody, textValue } from '@/src/lib/validation';
import { inTransaction, isUniqueViolation } from '@/src/lib/postgres';
import { createEmpresa, deleteEmpresa, updateEmpresa } from '@/src/models/Empresa';
import { assignFirstEmpresa, findUsuarioByEmail } from '@/src/models/Usuario';
import bcrypt from 'bcryptjs';
import { consumeLimit } from '@/src/lib/rate-limit';
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

async function changeCompany(request: Request, deleting: boolean) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Sessão inválida ou expirada.', 401);
  if (!user.empresaId || user.role !== 'owner') return jsonError('Somente o admin pode alterar ou excluir o restaurante.', 403);
  const empresaId = user.empresaId;
  try {
    const body = await readBody(request);
    // Bind the form to its restaurant so switching tabs cannot affect another one.
    if (body.empresaId !== empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
    let nome = '';
    let cnpj: string | null = null;
    if (deleting) {
      const senha = passwordValue(body.senha);
      if (!await consumeLimit(`delete-company:${user.id}`, 5, 15 * 60_000)) return jsonError('Muitas tentativas. Aguarde 15 minutos.', 429);
      const account = await findUsuarioByEmail(user.email);
      if (!account || account.id !== user.id || !await bcrypt.compare(senha, account.senha)) return jsonError('Senha do admin incorreta.', 403);
    } else {
      nome = textValue(body.nomeEmpresa, 'O nome do restaurante');
      if (typeof body.cnpj !== 'string') throw new InputError('Informe o CNPJ ou deixe o campo vazio.');
      const normalized = body.cnpj.trim().replace(/[.\/\-]/g, '').toUpperCase();
      if (normalized && !/^[A-Z0-9]{12}\d{2}$/.test(normalized)) throw new InputError('O CNPJ deve conter 14 caracteres, com os dois últimos numéricos.');
      cnpj = normalized || null;
    }
    return await inTransaction(async transaction => {
      const restaurant = await transaction.query('SELECT id FROM empresas WHERE id=$1 AND ativo=TRUE FOR UPDATE', [empresaId]);
      if (!restaurant.rowCount) return jsonError('Restaurante não encontrado.', 404);
      const membership = await findMembership(user.id, empresaId, transaction, true);
      if (membership?.role !== 'owner') return jsonError('Somente o admin pode alterar ou excluir o restaurante.', 403);
      if (deleting) await deleteEmpresa(empresaId, transaction);
      else await updateEmpresa(empresaId, nome, cnpj, transaction);
      return NextResponse.json({ message: deleting ? 'Restaurante excluído.' : 'Dados atualizados.' });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return jsonError('Este CNPJ já está cadastrado.', 409);
    return jsonError(error instanceof InputError ? error.message : 'Não foi possível alterar o restaurante.', error instanceof InputError ? 400 : 500);
  }
}
export async function PATCH(request: Request) { return changeCompany(request, false); }
export async function DELETE(request: Request) { return changeCompany(request, true); }
