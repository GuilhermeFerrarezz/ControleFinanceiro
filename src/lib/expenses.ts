import { QueryTypes, Transaction } from 'sequelize';
import { Expense, ExpenseAudit } from '../models/Expense';
import { sequelize } from './db';
import { InputError } from './validation';
import { addDays, daysBetween, EXPENSE_CATEGORIES, MAX_AMOUNT_CENTS, monthPeriod, PAYMENT_METHODS, type ExpenseDashboardData, type ExpenseFilters, type ExpenseInput, type ExpenseRecord } from './expense-shared';

export type ExpenseActor = { id: string; empresaId: string; role?: string };
export class ExpenseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function dateValue(value: unknown) {
  if (typeof value !== 'string' || !/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(value)) throw new InputError('Informe uma data válida.');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new InputError('Informe uma data válida.');
  return value;
}
function text(value: unknown, label: string, max: number, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && value.trim().length < 2)) throw new InputError(`${label}: ${required ? 'informe pelo menos 2 caracteres e ' : 'use '}no máximo ${max} caracteres.`);
  return value.trim();
}
export function validateExpense(body: Record<string, unknown>): ExpenseInput {
  if (!Number.isSafeInteger(body.amountCents) || Number(body.amountCents) <= 0 || Number(body.amountCents) > MAX_AMOUNT_CENTS) throw new InputError('Informe um valor válido maior que zero, com até duas casas decimais.');
  if (!EXPENSE_CATEGORIES.some(category => category.id === body.category)) throw new InputError('Escolha uma categoria válida.');
  const status = body.status ?? 'paid';
  const paymentMethod = body.paymentMethod ?? 'not_informed';
  if (status !== 'paid' && status !== 'pending') throw new InputError('Escolha uma situação de pagamento válida.');
  if (!PAYMENT_METHODS.some(method => method.id === paymentMethod)) throw new InputError('Escolha uma forma de pagamento válida.');
  return { description: text(body.description, 'Descrição', 120, true), merchant: text(body.merchant, 'Local ou favorecido', 120),
    notes: text(body.notes, 'Observações', 1000), amountCents: body.amountCents as number, date: dateValue(body.date),
    category: body.category as ExpenseInput['category'], status, paymentMethod: paymentMethod as ExpenseInput['paymentMethod'] };
}
export function uuidValue(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new InputError('Identificador inválido.');
  return value;
}
export function versionValue(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new InputError('Versão do lançamento inválida. Atualize a página.');
  return value as number;
}
export function expenseFilters(params = new URLSearchParams()): ExpenseFilters {
  const defaults = monthPeriod();
  const start = dateValue(params.get('start') || defaults.start);
  const end = dateValue(params.get('end') || defaults.end);
  if (start > end || daysBetween(start, end) > 366) throw new InputError('Escolha um período de até 366 dias, com início anterior ao fim.');
  const category = params.get('category') || '';
  const status = params.get('status') || '';
  const q = (params.get('q') || '').trim();
  const page = Number(params.get('page') || 1);
  if (category && !EXPENSE_CATEGORIES.some(item => item.id === category)) throw new InputError('Categoria de filtro inválida.');
  if (status && !['paid', 'pending'].includes(status)) throw new InputError('Situação de filtro inválida.');
  if (q.length > 120 || !Number.isSafeInteger(page) || page < 1 || page > 100000) throw new InputError('Filtros inválidos.');
  return { start, end, category, status, q, page };
}
const inputSnapshot = (expense: Expense) => Object.fromEntries(['description', 'amountCents', 'date', 'category', 'merchant', 'status', 'paymentMethod', 'notes', 'version', 'deletedAt'].map(field => [field, expense.get(field)]));
export async function createExpense(actor: ExpenseActor, input: ExpenseInput, requestId: string) {
  return sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    const existing = await Expense.findOne({ where: { empresaId: actor.empresaId, requestId }, paranoid: false, transaction });
    if (existing) {
      const matches = existing.get('createdBy') === actor.id && !existing.get('deletedAt') && Object.entries(input).every(([field, value]) => existing.get(field) === value);
      if (!matches) throw new ExpenseError('Este envio já foi utilizado. Atualize a página antes de tentar novamente.', 409);
      return { id: existing.get('id') as string, replayed: true };
    }
    const expense = await Expense.create({ ...input, empresaId: actor.empresaId, createdBy: actor.id, updatedBy: actor.id, requestId }, { transaction });
    await ExpenseAudit.create({ expenseId: expense.get('id'), empresaId: actor.empresaId, actorId: actor.id, action: 'created', after: JSON.stringify(inputSnapshot(expense)) }, { transaction });
    return { id: expense.get('id') as string, replayed: false };
  });
}
export async function changeExpense(actor: ExpenseActor, id: string, version: number, input: ExpenseInput | null) {
  await sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    const expense = await Expense.findOne({ where: { id, empresaId: actor.empresaId }, transaction });
    if (!expense) throw new ExpenseError('Lançamento não encontrado.', 404);
    if (actor.role !== 'owner' && expense.get('createdBy') !== actor.id) throw new ExpenseError('Você pode alterar apenas os seus próprios lançamentos.', 403);
    if (expense.get('version') !== version) throw new ExpenseError('Este lançamento foi alterado por outra pessoa. Atualize a lista e tente novamente.', 409);
    const before = JSON.stringify(inputSnapshot(expense));
    await expense.update({ ...(input || {}), updatedBy: actor.id, version: version + 1 }, { transaction });
    // Sequelize owns deletedAt in paranoid models; destroy performs the soft
    // deletion instead of silently ignoring a direct timestamp assignment.
    if (!input) await expense.destroy({ transaction });
    await ExpenseAudit.create({ expenseId: id, empresaId: actor.empresaId, actorId: actor.id, action: input ? 'updated' : 'deleted', before, after: JSON.stringify(inputSnapshot(expense)) }, { transaction });
  });
}

function scope(actor: ExpenseActor, filters: ExpenseFilters) {
  const clause = `e.empresaId = :empresaId AND e.deletedAt IS NULL AND e.date BETWEEN :start AND :end
    ${filters.category ? 'AND e.category = :category' : ''} ${filters.status ? 'AND e.status = :status' : ''}
    ${filters.q ? "AND (e.description LIKE :search ESCAPE '\\' OR e.merchant LIKE :search ESCAPE '\\')" : ''}`;
  return { clause, replacements: { empresaId: actor.empresaId, start: filters.start, end: filters.end, category: filters.category, status: filters.status,
    search: `%${filters.q.replace(/[\\%_]/g, '\\$&')}%` } };
}
type ExpenseRow = ExpenseInput & { id: string; createdBy: string; authorName: string; version: number; createdAt: string };
function toRecord(row: ExpenseRow, actor: ExpenseActor): ExpenseRecord {
  return { ...row, amountCents: Number(row.amountCents), canManage: actor.role === 'owner' || row.createdBy === actor.id };
}
const rowColumns = 'e.id,e.description,e.amountCents,e.date,e.category,e.merchant,e.status,e.paymentMethod,e.notes,e.createdBy,e.version,e.createdAt,u.nome AS authorName';
export async function expenseDashboard(actor: ExpenseActor, filters: ExpenseFilters): Promise<ExpenseDashboardData> {
  const { clause, replacements } = scope(actor, filters);
  return sequelize.transaction(async transaction => {
    const options = { replacements, type: QueryTypes.SELECT as const, transaction };
    const [totals] = await sequelize.query<{ totalCents: number; paidCents: number; pendingCents: number; count: number }>(
      `SELECT COALESCE(SUM(e.amountCents),0) AS totalCents, COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN e.status='paid' THEN e.amountCents ELSE 0 END),0) AS paidCents,
      COALESCE(SUM(CASE WHEN e.status='pending' THEN e.amountCents ELSE 0 END),0) AS pendingCents FROM expenses e WHERE ${clause}`, options);
    const pageSize = 15;
    const pages = Math.max(1, Math.ceil(totals.count / pageSize));
    const page = Math.min(filters.page, pages);
    const expenses = await sequelize.query<ExpenseRow>(`SELECT ${rowColumns} FROM expenses e JOIN usuarios u ON u.id=e.createdBy WHERE ${clause} ORDER BY e.date DESC,e.createdAt DESC,e.id DESC LIMIT :limit OFFSET :offset`, {
      ...options, replacements: { ...replacements, limit: pageSize, offset: (page - 1) * pageSize },
    });
    const categories = await sequelize.query<ExpenseDashboardData['categories'][number]>(`SELECT e.category,SUM(e.amountCents) AS totalCents,COUNT(*) AS count FROM expenses e WHERE ${clause} GROUP BY e.category ORDER BY totalCents DESC`, options);
    const daily = await sequelize.query<{ date: string; totalCents: number }>(`SELECT e.date,SUM(e.amountCents) AS totalCents FROM expenses e WHERE ${clause} GROUP BY e.date ORDER BY e.date`, options);
    const duration = daysBetween(filters.start, filters.end);
    const previousEnd = addDays(filters.start, -1);
    const [previous] = await sequelize.query<{ total: number }>(`SELECT COALESCE(SUM(e.amountCents),0) AS total FROM expenses e WHERE ${clause}`, {
      ...options, replacements: { ...replacements, start: addDays(previousEnd, -(duration - 1)), end: previousEnd },
    });
    const byDate = new Map(daily.map(day => [day.date, Number(day.totalCents)]));
    const series = Array.from({ length: duration }, (_, index) => { const date = addDays(filters.start, index); return { date, totalCents: byDate.get(date) || 0 }; });
    return { filters: { ...filters, page }, expenses: expenses.map(row => toRecord(row, actor)), count: totals.count, pages, pageSize,
      summary: { ...totals, averageDailyCents: Math.round(totals.totalCents / duration), previousTotalCents: previous.total,
        changePercent: previous.total > 0 ? Math.round((totals.totalCents - previous.total) / previous.total * 1000) / 10 : null }, categories, series };
  });
}
export async function exportExpenses(actor: ExpenseActor, filters: ExpenseFilters) {
  const { clause, replacements } = scope(actor, filters);
  const rows = await sequelize.query<ExpenseRow>(`SELECT ${rowColumns} FROM expenses e JOIN usuarios u ON u.id=e.createdBy WHERE ${clause} ORDER BY e.date DESC,e.createdAt DESC LIMIT 10001`, { replacements, type: QueryTypes.SELECT });
  if (rows.length > 10000) throw new InputError('A exportação permite até 10 mil gastos. Reduza o período ou use mais filtros.');
  const cell = (value: string) => `"${(/^[\s]*[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
  const lines = [['Data', 'Descrição', 'Categoria', 'Local / favorecido', 'Valor (R$)', 'Situação', 'Pagamento', 'Lançado por', 'Observações'], ...rows.map(row => [row.date, row.description,
    EXPENSE_CATEGORIES.find(category => category.id === row.category)?.label || row.category, row.merchant, (row.amountCents / 100).toFixed(2).replace('.', ','), row.status === 'paid' ? 'Pago' : 'A pagar',
    PAYMENT_METHODS.find(method => method.id === row.paymentMethod)?.label || '', row.authorName, row.notes])];
  return '\uFEFF' + lines.map(line => line.map(cell).join(';')).join('\r\n');
}
