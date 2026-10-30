import { expenseCategories, expenseDaily, expenseTotals, findExpense, insertExpense, insertExpenseAudit, listExpenses, updateExpense, type IExpense } from '../models/Expense';
import { inTransaction } from './postgres';
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
const inputSnapshot = (expense: IExpense) => Object.fromEntries(['description','amountCents','date','category','merchant','status','paymentMethod','notes','version','deletedAt'].map(field => [field, expense[field as keyof IExpense]]));
export async function createExpense(actor: ExpenseActor, input: ExpenseInput, requestId: string) {
  return inTransaction(async client => {
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
    const expense = await findExpense(id,actor.empresaId,client);
    if (!expense) throw new ExpenseError('Lançamento não encontrado.',404);
    if (actor.role !== 'owner' && expense.createdBy !== actor.id) throw new ExpenseError('Você pode alterar apenas os seus próprios lançamentos.',403);
    if (expense.version !== version) throw new ExpenseError('Este lançamento foi alterado por outra pessoa. Atualize a lista e tente novamente.',409);
    const updated = await updateExpense(id,actor.empresaId,actor.id,input,client);
    await insertExpenseAudit(updated,actor.id,input ? 'updated' : 'deleted',inputSnapshot(expense),inputSnapshot(updated),client);
  });
}
function toRecord(row: IExpense,actor: ExpenseActor): ExpenseRecord {
  // Keep persistence metadata out of the API response.
  return { id:row.id,description:row.description,amountCents:row.amountCents,date:row.date,category:row.category,merchant:row.merchant,
    status:row.status,paymentMethod:row.paymentMethod,notes:row.notes,createdBy:row.createdBy,authorName:row.authorName,
    version:row.version,createdAt:row.createdAt,canManage:actor.role === 'owner' || row.createdBy === actor.id };
}
export async function expenseDashboard(actor: ExpenseActor,filters: ExpenseFilters): Promise<ExpenseDashboardData> {
  return inTransaction(async client => {
    const totals = await expenseTotals(actor.empresaId,filters,client);
    const pageSize=15, pages=Math.max(1,Math.ceil(totals.count/pageSize)), page=Math.min(filters.page,pages);
    const expenses = await listExpenses(actor.empresaId,filters,pageSize,(page-1)*pageSize,client);
    const categories = await expenseCategories(actor.empresaId,filters,client);
    const daily = await expenseDaily(actor.empresaId,filters,client);
    const duration=daysBetween(filters.start,filters.end), previousEnd=addDays(filters.start,-1);
    const previous = await expenseTotals(actor.empresaId,{...filters,start:addDays(previousEnd,-(duration-1)),end:previousEnd},client);
    const byDate=new Map(daily.map(day=>[day.date,day.totalCents]));
    const series=Array.from({length:duration},(_,index)=>{const date=addDays(filters.start,index);return {date,totalCents:byDate.get(date)||0};});
    return { filters:{...filters,page},expenses:expenses.map(row=>toRecord(row,actor)),count:totals.count,pages,pageSize,
      summary:{...totals,averageDailyCents:Math.round(totals.totalCents/duration),previousTotalCents:previous.totalCents,
        changePercent:previous.totalCents>0 ? Math.round((totals.totalCents-previous.totalCents)/previous.totalCents*1000)/10 : null},categories,series };
  },true);
}
export async function exportExpenses(actor: ExpenseActor,filters: ExpenseFilters) {
  const rows=await listExpenses(actor.empresaId,filters,10001);
  if(rows.length>10000) throw new InputError('A exportação permite até 10 mil gastos. Reduza o período ou use mais filtros.');
  const cell = (value: string) => `"${(/^[\s]*[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
  const lines = [['Data', 'Descrição', 'Categoria', 'Local / favorecido', 'Valor (R$)', 'Situação', 'Pagamento', 'Lançado por', 'Observações'], ...rows.map(row => [row.date, row.description,
    EXPENSE_CATEGORIES.find(category => category.id === row.category)?.label || row.category, row.merchant, (row.amountCents / 100).toFixed(2).replace('.', ','), row.status === 'paid' ? 'Pago' : 'A pagar',
    PAYMENT_METHODS.find(method => method.id === row.paymentMethod)?.label || '', row.authorName, row.notes])];
  return '\uFEFF' + lines.map(line => line.map(cell).join(';')).join('\r\n');
}
