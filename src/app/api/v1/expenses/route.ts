import { expenseCsv } from '@/src/lib/expense-csv';
import { financeDays } from '@/src/lib/revenue';
import { listCategories } from '@/src/models/Catalog';
import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { InputError, readBody } from '@/src/lib/validation';
import { deleteExpensePeriod, createExpense, expenseDashboard, expenseFilters, expensesForExport, ExpenseError, uuidValue, validateExpense } from '@/src/lib/expenses';
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante para continuar.', 403);
  try {
    const params = new URL(request.url).searchParams;
    const filters = expenseFilters(params);
    if (params.get('format') === 'csv') return new Response(expenseCsv(await expensesForExport({ ...user, empresaId: user.empresaId }, filters)), { headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="gastos-${filters.start}-${filters.end}.csv"`, 'Cache-Control': 'no-store',
    } });
    if(params.get('format')==='xlsx') {
      const {expenseWorkbook}=await import('@/src/lib/expense-workbook');
      const bytes=await expenseWorkbook(await expensesForExport({...user,empresaId:user.empresaId},filters),filters,user.empresaNome||'Restaurante',await listCategories(user.empresaId),await financeDays(user.empresaId,filters));
      return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="gastos-${filters.start}-${filters.end}.xlsx"`,'Cache-Control':'no-store'}});
    }
    return NextResponse.json(await expenseDashboard({ ...user, empresaId: user.empresaId }, filters), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return jsonError(error instanceof InputError || error instanceof ExpenseError ? error.message : 'Não foi possível carregar os gastos.', error instanceof ExpenseError ? error.status : error instanceof InputError ? 400 : 500); }
}
export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId) return jsonError('Selecione um restaurante para continuar.', 403);
  try {
    const body = await readBody(request);
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
    const result = await deleteExpensePeriod({ ...user, empresaId: user.empresaId }, await readBody(request));
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof InputError || error instanceof ExpenseError ? error.message : 'Não foi possível excluir os lançamentos.', error instanceof ExpenseError ? error.status : error instanceof InputError ? 400 : 500);
  }
}
