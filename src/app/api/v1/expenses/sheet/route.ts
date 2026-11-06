import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { expenseFilters, expenseSheet, expenseSheetOrder } from '@/src/lib/expenses';
import { expenseSheetWorkbook } from '@/src/lib/expense-sheet-workbook';
import { InputError, readBody } from '@/src/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user?.empresaId) return jsonError('Entre na conta e selecione um restaurante.', user ? 403 : 401);
  try {
    const body = await readBody(request, 1024 * 1024);
    if (body.empresaId !== user.empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
    if (!Array.isArray(body.columns) || body.columns.length > 16384 ||
      !body.columns.every(id => typeof id === 'string' && id.length <= 50)) {
      throw new InputError('A ordem das categorias é inválida.');
    }
    const params = new URL(request.url).searchParams;
    const data = await expenseSheet({ ...user, empresaId: user.empresaId }, expenseFilters(params),
      expenseSheetOrder(params.get('sort')), { exportColumnIds: body.columns });
    const bytes = await expenseSheetWorkbook(data, user.empresaNome || 'Restaurante');
    return new Response(bytes, { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="planilha-${data.filters.start}-${data.filters.end}.xlsx"`,
      'Cache-Control': 'no-store',
    } });
  } catch (error) {
    return jsonError(error instanceof InputError ? error.message : 'Não foi possível exportar a planilha.', error instanceof InputError ? 400 : 500);
  }
}
