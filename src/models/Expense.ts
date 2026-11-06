import { db } from '../lib/db';
import type { Queryable } from '../lib/postgres';
import type { ExpenseInput, ExpenseFilters } from '../lib/expense-shared';

export interface IExpense extends ExpenseInput {
  categoryLabel?: string;
  id: string; empresaId: string; createdBy: string; updatedBy: string; requestId: string;
  version: number; createdAt: string; deletedAt: Date | null; authorName: string; isDemo: boolean;
}
export interface IExpenseAudit { id: string; expenseId: string; empresaId: string; actorId: string; action: 'created' | 'updated' | 'deleted'; before: Record<string, unknown> | null; after: Record<string, unknown> | null; createdAt: Date }
const columns = `e.id,e.empresa_id AS "empresaId",e.created_by AS "createdBy",e.updated_by AS "updatedBy",e.request_id AS "requestId",
  e.description,e.amount_cents AS "amountCents",to_char(e.date,'YYYY-MM-DD') AS date,e.category,e.merchant,e.status,
  e.payment_method AS "paymentMethod",e.notes,e.version,(e.demo_key IS NOT NULL) AS "isDemo",e.created_at AS "createdAt",e.deleted_at AS "deletedAt"`;
export function integer(value: unknown) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Valor agregado fora do intervalo seguro.');
  return number;
}
function expenseRow(row: IExpense & { createdAt: string | Date }) {
  return { ...row, amountCents: integer(row.amountCents), createdAt: new Date(row.createdAt).toISOString() } as IExpense;
}
export async function findExpense(id: string, empresaId: string, client: Queryable) {
  const { rows } = await client.query<IExpense>(`SELECT ${columns} FROM expenses e WHERE e.id=$1 AND e.empresa_id=$2 AND e.deleted_at IS NULL FOR UPDATE`, [id, empresaId]);
  return rows[0] ? expenseRow(rows[0]) : null;
}
export async function insertExpense(empresaId: string, userId: string, requestId: string, input: ExpenseInput, client: Queryable) {
  const { rows } = await client.query<{ id: string }>(`INSERT INTO expenses
    (empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category,merchant,status,payment_method,notes)
    VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (empresa_id,request_id) DO NOTHING RETURNING id`,
    [empresaId,userId,requestId,input.description,input.amountCents,input.date,input.category,input.merchant,input.status,input.paymentMethod,input.notes]);
  const created = !!rows[0];
  // A concurrent INSERT with the same key commits before this SELECT runs.
  const result = await client.query<IExpense>(`SELECT ${columns} FROM expenses e WHERE e.empresa_id=$1 AND e.request_id=$2 FOR UPDATE`, [empresaId, requestId]);
  return { expense: expenseRow(result.rows[0]), created };
}
export async function updateExpense(id: string, empresaId: string, userId: string, input: ExpenseInput | null, client: Queryable) {
  if (input) await client.query(`UPDATE expenses SET description=$1,amount_cents=$2,date=$3,category=$4,merchant=$5,status=$6,payment_method=$7,notes=$8,
    updated_by=$9,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$10 AND empresa_id=$11`,
    [input.description,input.amountCents,input.date,input.category,input.merchant,input.status,input.paymentMethod,input.notes,userId,id,empresaId]);
  else await client.query(`UPDATE expenses SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=$1,version=version+1 WHERE id=$2 AND empresa_id=$3`, [userId,id,empresaId]);
  const result = await client.query<IExpense>(`SELECT ${columns} FROM expenses e WHERE e.id=$1 AND e.empresa_id=$2`, [id,empresaId]);
  return expenseRow(result.rows[0]);
}
export async function insertExpenseAudit(expense: IExpense, actorId: string, action: IExpenseAudit['action'], before: Record<string, unknown> | null, after: Record<string, unknown>, client: Queryable) {
  await client.query('INSERT INTO expense_audit (expense_id,empresa_id,actor_id,action,before,after) VALUES ($1,$2,$3,$4,$5,$6)', [expense.id,expense.empresaId,actorId,action,before,after]);
}
export async function deleteExpensesInPeriod(empresaId: string, userId: string, start: string, end: string, client: Queryable) {
  // Lock matching active rows and audit exactly those changed by this statement.
  const { rows } = await client.query<{ deleted: number }>(`WITH targets AS MATERIALIZED (
    SELECT ${columns} FROM expenses e
    WHERE e.empresa_id=$1 AND e.deleted_at IS NULL AND e.date BETWEEN $3::date AND $4::date
    ORDER BY e.id FOR UPDATE
  ), updated AS (
    UPDATE expenses e SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,updated_by=$2,version=e.version+1
    FROM targets t WHERE e.id=t.id AND e.empresa_id=$1
    RETURNING e.id,to_jsonb(t) AS before,
      to_jsonb(t) || jsonb_build_object('deletedAt',e.deleted_at,'updatedBy',e.updated_by,'version',e.version,'source','period-delete') AS after
  ), audited AS (
    INSERT INTO expense_audit (expense_id,empresa_id,actor_id,action,before,after)
    SELECT id,$1,$2,'deleted',before,after FROM updated RETURNING id
  ) SELECT count(*)::integer AS deleted FROM audited`, [empresaId, userId, start, end]);
  return rows[0].deleted;
}
function scope(empresaId: string, filters: ExpenseFilters) {
  const values: unknown[] = [empresaId,filters.start,filters.end];
  const conditions = ['e.empresa_id=$1', 'e.deleted_at IS NULL', 'e.date BETWEEN $2::date AND $3::date'];
  if (filters.category) { values.push(filters.category); conditions.push(`e.category=$${values.length}`); }
  if (filters.merchant) {
    values.push(filters.merchant);
    conditions.push(`LOWER(e.merchant)=LOWER($${values.length})`);
  }
  if (filters.status) { values.push(filters.status); conditions.push(`e.status=$${values.length}`); }
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, '\\$&')}%`);
    conditions.push(`(e.description ILIKE $${values.length} ESCAPE E'\\\\' OR e.merchant ILIKE $${values.length} ESCAPE E'\\\\')`);
  }
  return { clause: conditions.join(' AND '), values };
}
export async function expenseTotals(empresaId: string, filters: ExpenseFilters, client: Queryable) {
  const { clause, values } = scope(empresaId,filters);
  const { rows } = await client.query<{ totalCents: string; paidCents: string; pendingCents: string; count: string }>(`SELECT COALESCE(SUM(e.amount_cents),0) AS "totalCents",COUNT(*) AS count,
    COALESCE(SUM(e.amount_cents) FILTER (WHERE e.status='paid'),0) AS "paidCents",COALESCE(SUM(e.amount_cents) FILTER (WHERE e.status='pending'),0) AS "pendingCents"
    FROM expenses e WHERE ${clause}`, values);
  const row=rows[0];
  return { totalCents: integer(row.totalCents), paidCents: integer(row.paidCents), pendingCents: integer(row.pendingCents), count: integer(row.count) };
}
export async function listExpenses(empresaId: string, filters: ExpenseFilters, limit: number, offset = 0, client: Queryable = db) {
  const { clause, values } = scope(empresaId,filters);
  const { rows } = await client.query<IExpense>(`SELECT ${columns},u.nome AS "authorName",c.name AS "categoryLabel" FROM expenses e JOIN usuarios u ON u.id=e.created_by
    LEFT JOIN restaurant_catalog c ON COALESCE(c.category_key,c.id::text)=e.category AND c.empresa_id=e.empresa_id AND c.kind='category'
    WHERE ${clause} ORDER BY e.date DESC,e.created_at DESC,e.id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`, [...values,limit,offset]);
  return rows.map(expenseRow);
}
export async function expenseCategories(empresaId: string, filters: ExpenseFilters, client: Queryable) {
  const { clause, values } = scope(empresaId,filters);
  return (await client.query<{ category: ExpenseInput['category']; totalCents: string; count: string }>(`SELECT e.category,SUM(e.amount_cents) AS "totalCents",COUNT(*) AS count
    FROM expenses e WHERE ${clause} GROUP BY e.category ORDER BY SUM(e.amount_cents) DESC,e.category`,values)).rows.map(row=>({...row,totalCents:integer(row.totalCents),count:integer(row.count)}));
}
export async function expenseDaily(empresaId: string, filters: ExpenseFilters, client: Queryable) {
  const { clause, values } = scope(empresaId,filters);
  return (await client.query<{ date: string; totalCents: string }>(`SELECT to_char(e.date,'YYYY-MM-DD') AS date,SUM(e.amount_cents) AS "totalCents"
    FROM expenses e WHERE ${clause} GROUP BY e.date ORDER BY e.date`,values)).rows.map(row=>({...row,totalCents:integer(row.totalCents)}));
}


export async function expenseDailyByCategory(empresaId: string, filters: ExpenseFilters, client: Queryable) {
  const { clause, values } = scope(empresaId, filters);
  const { rows } = await client.query<{ date: string; category: string; totalCents: string }>(
    `SELECT to_char(e.date,'YYYY-MM-DD') AS date, e.category, SUM(e.amount_cents) AS "totalCents"
    FROM expenses e WHERE ${clause} GROUP BY e.date, e.category`, values);
  return rows.map(row => ({ ...row, totalCents: integer(row.totalCents) }));
}

export async function expenseYears(empresaId: string, client: Queryable) {
  return (await client.query<{ year:number }>('SELECT DISTINCT EXTRACT(YEAR FROM date)::integer AS year FROM expenses WHERE empresa_id=$1 AND deleted_at IS NULL ORDER BY year DESC',[empresaId])).rows.map(row=>row.year);
}

export async function expenseBounds(empresaId: string,client: Queryable) {
  const {rows}=await client.query<{start:string|null;end:string|null}>("SELECT to_char(min(date),'YYYY-MM-DD') AS start,to_char(max(date),'YYYY-MM-DD') AS end FROM expenses WHERE empresa_id=$1 AND deleted_at IS NULL",[empresaId]);
  return rows[0].start && rows[0].end ? {start:rows[0].start,end:rows[0].end} : null;
}
export async function existingImportKeys(empresaId: string,ids: string[],keys: string[],client: Queryable,lock=false) {
  return (await client.query<{id:string;requestId:string;deletedAt:Date|null;createdBy:string}>(`SELECT id,request_id AS "requestId",deleted_at AS "deletedAt",created_by AS "createdBy" FROM expenses WHERE empresa_id=$1 AND (id=ANY($2::uuid[]) OR request_id=ANY($3::uuid[])) ORDER BY id ${lock?'FOR UPDATE':''}`,[empresaId,ids,keys])).rows;
}

export async function restoreImportedExpense(id:string,empresaId:string,userId:string,input:ExpenseInput,client:Queryable) {
  const result=await client.query<IExpense>(`SELECT ${columns} FROM expenses e WHERE e.id=$1 AND e.empresa_id=$2 AND e.deleted_at IS NOT NULL FOR UPDATE`,[id,empresaId]);
  if(!result.rows[0])return false;
  const before=expenseRow(result.rows[0]);
  await client.query('UPDATE expenses SET deleted_at=NULL WHERE id=$1 AND empresa_id=$2',[id,empresaId]);
  const after=await updateExpense(id,empresaId,userId,input,client);
  await insertExpenseAudit(after,userId,'updated',{...before},{...after,source:'csv-restore'},client);
  return true;
}

export async function insertImportedExpenses(empresaId:string,userId:string,items:{requestId:string;input:ExpenseInput}[],client:Queryable) {
  if(!items.length)return 0;
  const payload=items.map(({requestId,input})=>({request_id:requestId,description:input.description,amount_cents:input.amountCents,date:input.date,category:input.category,merchant:input.merchant,status:input.status,payment_method:input.paymentMethod,notes:input.notes}));
  const {rows}=await client.query<{imported:number}>(`WITH source AS (
    SELECT * FROM jsonb_to_recordset($3::jsonb) AS r(request_id uuid,description text,amount_cents bigint,date date,category text,merchant text,status text,payment_method text,notes text)
  ), inserted AS (
    INSERT INTO expenses (empresa_id,created_by,updated_by,request_id,description,amount_cents,date,category,merchant,status,payment_method,notes)
    SELECT $1,$2,$2,request_id,description,amount_cents,date,category,merchant,status,payment_method,notes FROM source
    ON CONFLICT (empresa_id,request_id) DO NOTHING RETURNING *
  ), audited AS (
    INSERT INTO expense_audit (expense_id,empresa_id,actor_id,action,after)
    SELECT id,$1,$2,'created',jsonb_build_object('description',description,'amountCents',amount_cents,'date',to_char(date,'YYYY-MM-DD'),'category',category,'merchant',merchant,'status',status,'paymentMethod',payment_method,'notes',notes,'version',version,'source','csv') FROM inserted
    RETURNING id
  ) SELECT count(*)::integer AS imported FROM audited`,[empresaId,userId,JSON.stringify(payload)]);
  return rows[0].imported;
}
