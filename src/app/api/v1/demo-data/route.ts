import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { demoDataEnabled, manageDemoData } from '@/src/lib/demo-data';
import { ExpenseError } from '@/src/lib/expenses';
import { InputError, readBody } from '@/src/lib/validation';
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.',403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.',401);
  if (!demoDataEnabled()) return jsonError('Os dados de exemplo estão desativados.',404);
  if (user.role !== 'owner' || !user.empresaId) return jsonError('Apenas o dono pode gerenciar os exemplos.',403);
  try {
    const { action } = await readBody(request);
    if (action !== 'restore' && action !== 'clear') throw new InputError('Escolha restaurar ou excluir os exemplos.');
    return NextResponse.json(await manageDemoData({ ...user,empresaId:user.empresaId },action));
  } catch (error) {
    return jsonError(error instanceof InputError || error instanceof ExpenseError ? error.message : 'Não foi possível atualizar os exemplos.',error instanceof ExpenseError ? error.status : error instanceof InputError ? 400 : 500);
  }
}
