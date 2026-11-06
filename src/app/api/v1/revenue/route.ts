import { NextResponse } from 'next/server';
import { currentUser, jsonError, trustedOrigin } from '@/src/lib/auth';
import { dateValue, expenseFilters } from '@/src/lib/expenses';
import { MAX_AMOUNT_CENTS } from '@/src/lib/expense-shared';
import { listRevenue, saveRevenue } from '@/src/lib/revenue';
import { parseRevenueCsv, revenueCsv } from '@/src/lib/revenue-csv';
import { InputError, readBody } from '@/src/lib/validation';

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user?.empresaId) return jsonError('Entre na conta e selecione um restaurante.', user ? 403 : 401);
  try {
    const params = new URL(request.url).searchParams;
    const template = params.get('format') === 'template';
    const period = expenseFilters(params);
    const rows = template ? [{ date: period.start, totalCents: 12590 }] : await listRevenue(user.empresaId, period);
    return new Response(revenueCsv(rows), { headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${template ? 'modelo-faturamento' : 'faturamento'}-${period.start}.csv"`,
      'Cache-Control': 'no-store',
    } });
  } catch (error) {
    return jsonError(error instanceof InputError ? error.message : 'Não foi possível exportar o faturamento.', error instanceof InputError ? 400 : 500);
  }
}

export async function POST(request: Request) {
  if (!trustedOrigin(request)) return jsonError('Origem não permitida.', 403);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para continuar.', 401);
  if (!user.empresaId || user.role !== 'owner') return jsonError('Somente o dono pode registrar faturamento.', 403);
  try {
    const body = await readBody(request, 4 * 1024 * 1024);
    if (body.empresaId !== user.empresaId) return jsonError('O restaurante ativo mudou. Atualize a página.', 409);
    if (body.mode !== 'save' && body.mode !== 'preview' && body.mode !== 'import') throw new InputError('Operação inválida.');
    const actor = { id: user.id, empresaId: user.empresaId };
    if (body.mode === 'save') {
      const date = dateValue(body.date);
      const totalCents = body.totalCents;
      if (typeof totalCents !== 'number' || !Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > MAX_AMOUNT_CENTS) {
        throw new InputError('Informe um faturamento válido, maior ou igual a zero.');
      }
      const saved = await saveRevenue(actor, [{ date, totalCents }], true);
      return saved ? NextResponse.json(saved) : jsonError('Somente o dono pode registrar faturamento.', 403);
    }
    const rows = parseRevenueCsv(body.csv);
    if (body.mode === 'preview') return NextResponse.json({ count: rows.length, rows: rows.slice(0, 10) });
    const imported = await saveRevenue(actor, rows, false);
    return imported ? NextResponse.json(imported) : jsonError('Somente o dono pode importar faturamento.', 403);
  } catch (error) {
    return jsonError(error instanceof InputError ? error.message : 'Não foi possível salvar o faturamento.', error instanceof InputError ? 400 : 500);
  }
}
