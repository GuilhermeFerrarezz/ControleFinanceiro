import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { InputError, readBody } from '@/src/lib/validation';
import { changeExpense, ExpenseError, uuidValue, validateExpense, versionValue } from '@/src/lib/expenses';
type Context = { params: Promise<{ id: string }> };
async function mutate(request: Request, context: Context, remove: boolean) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante para continuar.', 403);
  try {
    const id = uuidValue((await context.params).id);
    const body = await readBody(request);
    await changeExpense({ ...user, empresaId: user.empresaId }, id, versionValue(body.version), remove ? null : validateExpense(body));
    return NextResponse.json({ message: remove ? 'Gasto excluído.' : 'Gasto atualizado.' });
  } catch (error) { return jsonError(error instanceof InputError || error instanceof ExpenseError ? error.message : 'Não foi possível alterar o gasto.', error instanceof ExpenseError ? error.status : error instanceof InputError ? 400 : 500); }
}
export async function PATCH(request: Request, context: Context) { return mutate(request, context, false); }
export async function DELETE(request: Request, context: Context) { return mutate(request, context, true); }
