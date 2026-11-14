import { expenseCsv } from '@/src/lib/expense-csv';
import { SecurityLimitError, withExportBudget, withPasswordBudget } from '@/src/lib/security-limits';
import bcrypt from 'bcryptjs';
import { findUsuarioByEmail } from '@/src/models/Usuario';
import { consumeLimit } from '@/src/lib/rate-limit';
import { NextResponse } from 'next/server';
import { matchesRestaurantContext, currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { InputError, passwordValue, readBody } from '@/src/lib/validation';
import { deleteExpensePeriod, createExpense, expenseDashboard, expenseFilters, expenseExportData, expensesForExport, ExpenseError, uuidValue, validateExpense } from '@/src/lib/expenses';
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante para continuar.', 403);
  if (!matchesRestaurantContext(request, user.empresaId)) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
  try {
    const params = new URL(request.url).searchParams;
    const filters = expenseFilters(params);
    const empresaId = user.empresaId;
    const render = async () => {
    if (params.get('format') === 'csv-zip') {
      const { expenseCsvArchive } = await import('@/src/lib/expense-csv-archive');
      const bytes = await expenseCsvArchive({ ...user, empresaId }, filters);
      return new Response(bytes, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="gastos-${filters.start}-${filters.end}.zip"`, 'Cache-Control': 'no-store' } });
    }
    if (params.get('format') === 'csv') return new Response(expenseCsv(await expensesForExport({ ...user, empresaId }, filters)), { headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="gastos-${filters.start}-${filters.end}.csv"`, 'Cache-Control': 'no-store',
    } });
    if(params.get('format')==='xlsx') {
      const {expenseWorkbook}=await import('@/src/lib/expense-workbook');
      const data = await expenseExportData({ ...user, empresaId }, filters);
      const bytes=await expenseWorkbook(data.rows,filters,user.empresaNome||'Restaurante',data.categories,data.financial);
      return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="gastos-${filters.start}-${filters.end}.xlsx"`,'Cache-Control':'no-store'}});
    }
    return NextResponse.json(await expenseDashboard({ ...user, empresaId }, filters), { headers: { 'Cache-Control': 'no-store' } });
    };
    return ['csv', 'xlsx', 'csv-zip'].includes(params.get('format') || '') ? await withExportBudget(user.id, render) : await render();
  } catch (error) { if (error instanceof SecurityLimitError) return jsonError(error.message, 429);return jsonError(error instanceof InputError || error instanceof ExpenseError ? error.message : 'Não foi possível carregar os gastos.', error instanceof ExpenseError ? error.status : error instanceof InputError ? 400 : 500); }
}
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante para continuar.', 403);
  try {
    const body = await readBody(request, 32768);
    if (body.expectedEmpresaId !== undefined && body.expectedEmpresaId !== user.empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
    const result = await createExpense({ ...user, empresaId: user.empresaId }, validateExpense(body), uuidValue(body.requestId));
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) { return jsonError(error instanceof InputError || error instanceof ExpenseError ? error.message : 'Não foi possível salvar o gasto. Tente novamente.', error instanceof ExpenseError ? error.status : error instanceof InputError ? 400 : 500); }
}
export async function DELETE(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId || user.role !== 'owner') return jsonError('Somente o admin pode excluir os lançamentos de um período.', 403);
  try {
    const body = await readBody(request, 32768);
    if (body.empresaId !== user.empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
    const senha = passwordValue(body.senha);
    if (!await consumeLimit(`delete-expenses:${user.id}`, 5, 15 * 60_000)) return jsonError('Muitas tentativas. Aguarde 15 minutos.', 429);
    const account = await findUsuarioByEmail(user.email);
    if (!account || account.id !== user.id || !await withPasswordBudget(() => bcrypt.compare(senha, account.senha))) return jsonError('Senha do admin incorreta.', 403);
    const result = await deleteExpensePeriod({ ...user, empresaId: user.empresaId }, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SecurityLimitError) return jsonError(error.message, 429);
    return jsonError(error instanceof InputError || error instanceof ExpenseError ? error.message : 'Não foi possível excluir os lançamentos.', error instanceof ExpenseError ? error.status : error instanceof InputError ? 400 : 500);
  }
}
