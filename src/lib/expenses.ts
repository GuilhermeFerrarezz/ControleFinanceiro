import { deleteExpensesInPeriod, countDemoExpenses, expenseBounds, expenseYears, expenseCategories, expenseDaily, expenseTotals, findExpense, insertExpense, insertExpenseAudit, listExpenses, updateExpense, type IExpense } from '../models/Expense';
import { inTransaction } from './postgres';
import { InputError } from './validation';
import { findMembership } from '../models/Membership';
import { listCategories } from '../models/Catalog';
import { addDays, buildExpenseSeries, daysBetween, EXPENSE_CATEGORIES, MAX_AMOUNT_CENTS, monthPeriod, yearPeriod, todayInSaoPaulo, PAYMENT_METHODS, type ExpenseDashboardData, type ExpenseFilters, type ExpenseInput, type ExpenseRecord } from './expense-shared';

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
  if (typeof value !== 'string' || value.includes('\0') || value.trim().length > max || (required && value.trim().length < 2)) throw new InputError(`${label}: ${required ? 'informe pelo menos 2 caracteres e ' : 'use '}no máximo ${max} caracteres, sem caracteres nulos.`);
  return value.trim();
}
export function validateExpense(body: Record<string, unknown>): ExpenseInput {
  if (!Number.isSafeInteger(body.amountCents) || Number(body.amountCents) <= 0 || Number(body.amountCents) > MAX_AMOUNT_CENTS) throw new InputError('Informe um valor válido maior que zero, com até duas casas decimais.');
  if (!validCategoryKey(body.category)) throw new InputError('Escolha uma categoria válida.');
  const status = body.status ?? 'paid';
  const paymentMethod = body.paymentMethod ?? 'not_informed';
  if (status !== 'paid' && status !== 'pending') throw new InputError('Escolha uma situação de pagamento válida.');
  if (!PAYMENT_METHODS.some(method => method.id === paymentMethod)) throw new InputError('Escolha uma forma de pagamento válida.');
  return { description: text(body.description, 'Descrição', 120, true), merchant: text(body.merchant, 'Local ou favorecido', 120),
    notes: text(body.notes, 'Observações', 1000), amountCents: body.amountCents as number, date: dateValue(body.date),
    category: body.category as ExpenseInput['category'], status, paymentMethod: paymentMethod as ExpenseInput['paymentMethod'] };
}
function validCategoryKey(value: unknown) {
  return typeof value === 'string' && (EXPENSE_CATEGORIES.some(category => category.id === value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value));
}
async function requireCategory(empresaId: string, category: string, client: import('./postgres').Queryable) {
  if (!(await listCategories(empresaId, client)).some(item => item.id === category)) throw new InputError('Categoria não cadastrada neste restaurante.');
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
  const year = params.get('year');
  if (year !== null && !/^(20[0-9]{2}|2100)$/.test(year)) throw new InputError('Escolha um ano válido.');
  const defaults = year === null ? monthPeriod() : yearPeriod(Number(year));
  const start = dateValue(year === null ? params.get('start') || defaults.start : defaults.start);
  const end = dateValue(year === null ? params.get('end') || defaults.end : defaults.end);
  if (start > end) throw new InputError('A data inicial deve ser anterior ou igual à data final.');
  const category = params.get('category') || '';
  const status = params.get('status') || '';
  const q = (params.get('q') || '').trim();
  const page = Number(params.get('page') || 1);
  if (category && !validCategoryKey(category)) throw new InputError('Categoria de filtro inválida.');
  if (status && !['paid', 'pending'].includes(status)) throw new InputError('Situação de filtro inválida.');
  if (q.length > 120 || !Number.isSafeInteger(page) || page < 1 || page > 100000) throw new InputError('Filtros inválidos.');
  return { start, end, category, status, q, page };
}
const inputSnapshot = (expense: IExpense) => Object.fromEntries(['description','amountCents','date','category','merchant','status','paymentMethod','notes','version','deletedAt'].map(field => [field, expense[field as keyof IExpense]]));
export async function createExpense(actor: ExpenseActor, input: ExpenseInput, requestId: string) {
  return inTransaction(async client => {
    if (!await findMembership(actor.id,actor.empresaId,client,true)) throw new ExpenseError('Você não tem mais acesso a este restaurante.',403);
    await requireCategory(actor.empresaId, input.category, client);
    const { expense, created } = await insertExpense(actor.empresaId,actor.id,requestId,input,client);
    if (!created) {
      const matches = expense.createdBy === actor.id && !expense.deletedAt && Object.entries(input).every(([field,value]) => expense[field as keyof IExpense] === value);
      if (!matches) throw new ExpenseError('Este envio já foi utilizado. Atualize a página antes de tentar novamente.',409);
      return { id: expense.id, replayed: true };
    }
    await insertExpenseAudit(expense,actor.id,'created',null,inputSnapshot(expense),client);
    return { id: expense.id, replayed: false };
  });
}
export async function changeExpense(actor: ExpenseActor,id: string,version: number,input: ExpenseInput | null) {
  await inTransaction(async client => {
    const membership = await findMembership(actor.id,actor.empresaId,client,true);
    if (!membership) throw new ExpenseError('Você não tem mais acesso a este restaurante.',403);
    if (input) await requireCategory(actor.empresaId, input.category, client);
    const expense = await findExpense(id,actor.empresaId,client);
    if (!expense) throw new ExpenseError('Lançamento não encontrado.',404);
    if (membership.role !== 'owner' && expense.createdBy !== actor.id) throw new ExpenseError('Você pode alterar apenas os seus próprios lançamentos.',403);
    if (expense.version !== version) throw new ExpenseError('Este lançamento foi alterado por outra pessoa. Atualize a lista e tente novamente.',409);
    const updated = await updateExpense(id,actor.empresaId,actor.id,input,client);
    await insertExpenseAudit(updated,actor.id,input ? 'updated' : 'deleted',inputSnapshot(expense),inputSnapshot(updated),client);
  });
}
export async function deleteExpensePeriod(actor: ExpenseActor, body: Record<string, unknown>) {
  const start = dateValue(body.start);
  const end = dateValue(body.end);
  if (start > end) throw new InputError('A data inicial deve ser anterior ou igual à data final.');
  if (body.confirm !== true) throw new InputError('Confirme a exclusão dos lançamentos do período.');
  if (body.empresaId !== actor.empresaId) throw new ExpenseError('O restaurante ativo mudou. Atualize a página.', 409);
  return inTransaction(async client => {
    const membership = await findMembership(actor.id, actor.empresaId, client, true);
    if (membership?.role !== 'owner') throw new ExpenseError('Somente o admin pode excluir os lançamentos de um período.', 403);
    return { deleted: await deleteExpensesInPeriod(actor.empresaId, actor.id, start, end, client) };
  });
}
function toRecord(row: IExpense,actor: ExpenseActor): ExpenseRecord {
  // Keep persistence metadata out of the API response.
  return { id:row.id,description:row.description,amountCents:row.amountCents,date:row.date,category:row.category,merchant:row.merchant,
    status:row.status,paymentMethod:row.paymentMethod,notes:row.notes,createdBy:row.createdBy,authorName:row.authorName,
    version:row.version,createdAt:row.createdAt,isDemo:row.isDemo,canManage:actor.role === 'owner' || row.createdBy === actor.id };
}
export async function expenseDashboard(actor: ExpenseActor,filters: ExpenseFilters): Promise<ExpenseDashboardData> {
  return inTransaction(async client => {
    const categoryOptions = await listCategories(actor.empresaId, client);
    const totals = await expenseTotals(actor.empresaId,filters,client);
    const demoCount = await countDemoExpenses(actor.empresaId,client);
    const years = Array.from(new Set([Number(todayInSaoPaulo().slice(0,4)), ...await expenseYears(actor.empresaId,client)])).sort((a,b)=>b-a);
    const pageSize=15, pages=Math.max(1,Math.ceil(totals.count/pageSize)), page=Math.min(filters.page,pages);
    const expenses = await listExpenses(actor.empresaId,filters,pageSize,(page-1)*pageSize,client);
    const categories = await expenseCategories(actor.empresaId,filters,client);
    const daily = await expenseDaily(actor.empresaId,filters,client);
    const duration=daysBetween(filters.start,filters.end), previousEnd=addDays(filters.start,-1);
    const previous = await expenseTotals(actor.empresaId,{...filters,start:addDays(previousEnd,-(duration-1)),end:previousEnd},client);
    const trend=buildExpenseSeries(daily,filters.start,filters.end);
    const availablePeriod=await expenseBounds(actor.empresaId,client);
    return { categoryOptions, filters:{...filters,page},expenses:expenses.map(row=>toRecord(row,actor)),count:totals.count,pages,pageSize,demoCount,years,
      summary:{...totals,averageDailyCents:Math.round(totals.totalCents/duration),previousTotalCents:previous.totalCents,
        changePercent:previous.totalCents>0 ? Math.round((totals.totalCents-previous.totalCents)/previous.totalCents*1000)/10 : null},categories,...trend,availablePeriod };
  },true);
}
export async function expensesForExport(actor: ExpenseActor,filters: ExpenseFilters) {
  const rows=await listExpenses(actor.empresaId,filters,10001);
  if(rows.length>10000) throw new InputError('A exportação permite até 10 mil gastos. Reduza o período ou use mais filtros.');
  return rows;
}
