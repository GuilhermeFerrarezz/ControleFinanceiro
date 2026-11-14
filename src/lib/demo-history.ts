import { createHash } from 'node:crypto';
import { insertCatalogEntry, listCategories, lockCatalog } from '../models/Catalog';
import { insertExpense, insertExpenseAudit } from '../models/Expense';
import { findMembership } from '../models/Membership';
import { dateValue, validateExpense } from './expenses';
import { addDays, daysBetween, PAYMENT_METHODS, type ExpenseItem } from './expense-shared';
import { inTransaction } from './postgres';

function stableId(value: string) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

// Only fills missing revenue fields. Existing monetary values and quantities are retained.
export async function seedDemoHistory(actor: { id: string; empresaId: string }, start: string, end: string) {
  dateValue(start); dateValue(end);
  if (start > end) throw new Error('O início deve ser anterior ao fim.');
  return inTransaction(async client => {
    if ((await findMembership(actor.id, actor.empresaId, client, true))?.role !== 'owner') throw new Error('Selecione uma conta administradora.');
    await lockCatalog(actor.empresaId, client);
    const categories = (await listCategories(actor.empresaId, client)).filter(row => !row.archived);
    const samples: { name: string; content: ExpenseItem['packageContent']; price: number }[] = [
      { name: 'Arroz pacote 5 kg (exemplo)', content: { quantity: 5, unit: 'kg' }, price: 2490 },
      { name: 'Óleo frasco 900 ml (exemplo)', content: { quantity: 900, unit: 'ml' }, price: 799 },
      { name: 'Ovos bandeja 30 un (exemplo)', content: { quantity: 30, unit: 'un' }, price: 1890 },
    ];
    const products = [];
    for (const sample of samples) products.push({ ...sample, ...await insertCatalogEntry(actor.empresaId, 'product', sample.name, client, 'pacote', sample.content ?? null) });
    const merchant = await insertCatalogEntry(actor.empresaId, 'merchant', 'Distribuidora de demonstração (exemplo)', client);
    const count = daysBetween(start, end);
    let expensesAdded = 0, expensesSkipped = 0, revenueAdded = 0, revenueCompleted = 0;
    for (let index = 0; index < count; index++) {
      const date = addDays(start, index);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const trend = Math.floor(index / 30);
      const closed = weekday === 1;
      const delivery = closed ? 0 : 24 + trend * 2 + (index * 7 % 23) + (weekday >= 5 ? 18 : 0);
      const dineIn = closed ? 0 : 30 + trend + (index * 11 % 31) + (weekday === 0 ? 20 : 0);
      const orders = Math.ceil(delivery / 1.6) + Math.ceil(dineIn / 1.3);
      const key = `full-history-v1:${date}`;
      const inserted = await client.query(`INSERT INTO daily_revenue (empresa_id,date,amount_cents,delivery_meals,dine_in_meals,order_count,demo_key)
        VALUES ($1,$2::date,$3,$4,$5,$6,$7) ON CONFLICT (empresa_id,date) DO NOTHING`,
      [actor.empresaId, date, closed ? 0 : delivery * 2200 + dineIn * 2800 + (index % 12) * 500, delivery, dineIn, orders, key]);
      revenueAdded += inserted.rowCount ?? 0;
      if (!inserted.rowCount) {
        const updated = await client.query(`UPDATE daily_revenue SET delivery_meals=COALESCE(delivery_meals,CASE WHEN amount_cents=0 THEN 0 ELSE $3 END),
          dine_in_meals=COALESCE(dine_in_meals,CASE WHEN amount_cents=0 THEN 0 ELSE $4 END),
          order_count=COALESCE(order_count,CASE WHEN amount_cents=0 THEN 0 ELSE $5 END),demo_key=COALESCE(demo_key,$6),updated_at=CURRENT_TIMESTAMP
          WHERE empresa_id=$1 AND date=$2::date AND (delivery_meals IS NULL OR dine_in_meals IS NULL OR order_count IS NULL)`,
        [actor.empresaId, date, delivery, dineIn, orders, key]);
        revenueCompleted += updated.rowCount ?? 0;
      }
      if (index % 3 !== 0 && date !== end) continue;
      const expenseKey = `${key}:expense`;
      if ((await client.query('SELECT id FROM expenses WHERE empresa_id=$1 AND demo_key=$2', [actor.empresaId, expenseKey])).rowCount) { expensesSkipped++; continue; }
      const category = categories[Math.floor(index / 3) % categories.length];
      if (!category) throw new Error('Cadastre uma categoria ativa antes de gerar exemplos.');
      const items: ExpenseItem[] = products.map((product, itemIndex) => ({
        productId: product.id, name: product.name, unit: 'pacote', quantity: 1 + (index + itemIndex) % 4,
        amountCents: product.price * (1 + (index + itemIndex) % 4), packageContent: product.content,
      }));
      const productPurchase = category.id === 'alimentos';
      const input = validateExpense({
        description: `${category.label} — demonstração ${date}`, date, category: category.id,
        amountCents: productPurchase ? items.reduce((total, item) => total + item.amountCents, 0) : 6500 + (index * 137 % 18000),
        items: productPurchase ? items : [], merchant: merchant.name,
        status: index % 4 === 0 ? 'pending' : 'paid', paymentMethod: PAYMENT_METHODS[Math.floor(index / 3) % PAYMENT_METHODS.length].id,
        notes: 'DADOS FICTÍCIOS. Histórico de demonstração para avaliar filtros, gráficos, produtos, quantidades, pagamentos e relatórios.',
      });
      const saved = await insertExpense(actor.empresaId, actor.id, stableId(`${actor.empresaId}:${expenseKey}`), input, client);
      if (saved.created) {
        await client.query('UPDATE expenses SET demo_key=$2 WHERE id=$1', [saved.expense.id, expenseKey]);
        await insertExpenseAudit(saved.expense, actor.id, 'created', null, { ...input, source: 'demo-history', demoKey: expenseKey }, client);
        expensesAdded++;
      } else expensesSkipped++;
    }
    return { start, end, days: count, expensesAdded, expensesSkipped, revenueAdded, revenueCompleted };
  });
}
