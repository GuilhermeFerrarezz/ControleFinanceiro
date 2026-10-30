import { randomUUID } from 'node:crypto';
import { EXPENSE_CATEGORIES, todayInSaoPaulo, type ExpenseInput } from './expense-shared';
import { ExpenseError, type ExpenseActor } from './expenses';
import { inTransaction } from './postgres';
import { findMembership } from '../models/Membership';
import { countDemoExpenses, insertExpense, insertExpenseAudit, listDemoExpenses, restoreDemoExpense, tagDemoExpense, updateExpense } from '../models/Expense';

export const demoDataEnabled = () => process.env.ENABLE_DEMO_DATA === 'true';
export function demoSamples(today = todayInSaoPaulo()) {
  const descriptions = ['Hortifruti e insumos','Diárias da equipe','Produtos de limpeza','Reposição de bebidas','Embalagens para delivery','Contas da operação','Manutenção da cozinha','Impostos e taxas','Utensílios e outros'];
  const merchants = ['Feira do Bairro','Equipe do restaurante','Limpeza & Cia','Distribuidora Central','Casa das Embalagens','Serviços e locação','Oficina da Cozinha','Guias e tributos','Casa do Chef'];
  const amounts = [75490,92000,12990,18750,9850,145000,23900,32100,7990];
  const months = [];
  for (let year=2025; year<=Number(today.slice(0,4)); year++) {
    const lastMonth = year === Number(today.slice(0,4)) ? Number(today.slice(5,7)) : 12;
    for (let month=1; month<=lastMonth; month++) {
      const label = `${year}-${String(month).padStart(2,'0')}`;
      const days = label === today.slice(0,7) ? Number(today.slice(8)) : new Date(Date.UTC(year,month,0)).getUTCDate();
      months.push({ month:label, days, count:18 });
    }
  }
  return months.flatMap(period => Array.from({ length:period.count },(_,index) => {
    const category = index % EXPENSE_CATEGORIES.length;
    const day = 1 + Math.floor(index * (period.days-1) / (period.count-1));
    const monthNumber = Number(period.month.slice(5));
    const seasonal = 1 + (monthNumber%4)*.04 + (Number(period.month.slice(0,4))-2025)*.06;
    const input: ExpenseInput = {
      description: `${descriptions[category]} · ${1+Math.floor(index/9)}`,
      amountCents: Math.round(amounts[category] * seasonal * (1+(index%4)*.07)),
      date:`${period.month}-${String(day).padStart(2,'0')}`,category:EXPENSE_CATEGORIES[category].id,
      merchant:merchants[category],status:index%4===0 && period.month===today.slice(0,7) ? 'pending' : 'paid',
      paymentMethod:index%3===0 ? 'pix' : index%3===1 ? 'credit' : 'boleto',
      notes:'Dado fictício para testar o painel. Pode ser excluído e restaurado pelos controles de exemplos.',
    };
    return { key:`v2-${period.month}-${index}`,input };
  }));
}
export async function manageDemoData(actor: ExpenseActor,action: 'restore' | 'clear') {
  if (!demoDataEnabled()) throw new ExpenseError('Os dados de exemplo estão desativados.',404);
  return inTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`demo:${actor.empresaId}`]);
    const member = await findMembership(actor.id,actor.empresaId,client);
    if (member?.role !== 'owner') throw new ExpenseError('Apenas o dono pode gerenciar os exemplos.',403);
    const existing = await listDemoExpenses(actor.empresaId,client);
    if (action === 'clear') {
      for (const expense of existing.filter(expense => !expense.deletedAt)) {
        const updated = await updateExpense(expense.id,actor.empresaId,actor.id,null,client);
        await insertExpenseAudit(updated,actor.id,'deleted',{ ...expense },{ ...updated, isDemo:true },client);
      }
    } else {
      const samples = demoSamples();
      const keys = new Set(samples.map(sample=>sample.key));
      // Retire previous sample sets without touching real expenses or their history.
      for (const expense of existing.filter(expense=>!expense.deletedAt && !keys.has(expense.demoKey))) {
        const updated = await updateExpense(expense.id,actor.empresaId,actor.id,null,client);
        await insertExpenseAudit(updated,actor.id,'deleted',{ ...expense },{ ...updated,isDemo:true },client);
      }
      const byKey = new Map(existing.map(expense => [expense.demoKey,expense]));
      for (const sample of samples) {
        const old = byKey.get(sample.key);
        if (old) {
          await restoreDemoExpense(old.id,actor.empresaId,client);
          const updated = await updateExpense(old.id,actor.empresaId,actor.id,sample.input,client);
          await insertExpenseAudit(updated,actor.id,'updated',{ ...old },{ ...updated, isDemo:true },client);
        } else {
          const { expense } = await insertExpense(actor.empresaId,actor.id,randomUUID(),sample.input,client);
          await tagDemoExpense(expense.id,actor.empresaId,sample.key,client);
          await insertExpenseAudit(expense,actor.id,'created',null,{ ...sample.input, isDemo:true },client);
        }
      }
    }
    return { count:await countDemoExpenses(actor.empresaId,client) };
  });
}
