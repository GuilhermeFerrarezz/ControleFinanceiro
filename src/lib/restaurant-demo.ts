import { createHash } from 'node:crypto';
import { insertCatalogEntry, listCategories, lockCatalog } from '../models/Catalog';
import { findExpense, insertExpense, insertExpenseAudit, updateExpense } from '../models/Expense';
import { findMembership } from '../models/Membership';
import { normalizeCatalogName } from './catalog-shared';
import { dateValue, validateExpense } from './expenses';
import { addDays, daysBetween, PAYMENT_METHODS, todayInSaoPaulo, type ExpenseItem } from './expense-shared';
import { inTransaction } from './postgres';
import { demoUnitPrice } from './demo-prices';
import { sumCents } from './financial-math';

type Product = { name: string; unit: ExpenseItem['unit']; quantity: number; price: number; content?: ExpenseItem['packageContent'] };
type Purchase = { key: string; category: string; description: string; merchant: string; products: Product[] };
const purchases: Purchase[] = [
  { key: 'mercado', category: 'Mercado', description: 'Compra completa de mercado', merchant: 'Mart Minas (exemplo)', products: [
    { name: 'Arroz', unit: 'kg', quantity: 5, price: 599 }, { name: 'Feijão', unit: 'kg', quantity: 3, price: 899 },
    { name: 'Açúcar', unit: 'kg', quantity: 2, price: 449 }, { name: 'Óleo de soja', unit: 'L', quantity: 2, price: 899 },
    { name: 'Café', unit: 'pacote', quantity: 2, price: 1790, content: { quantity: 500, unit: 'g' } },
    { name: 'Leite', unit: 'L', quantity: 4, price: 499 }, { name: 'Farinha de trigo', unit: 'kg', quantity: 2, price: 549 },
    { name: 'Sal', unit: 'kg', quantity: 1, price: 249 },
    { name: 'Macarrão', unit: 'pacote', quantity: 4, price: 499, content: { quantity: 500, unit: 'g' } },
    { name: 'Molho de tomate', unit: 'pacote', quantity: 4, price: 299, content: { quantity: 340, unit: 'g' } },
  ] },
  { key: 'hortifruti', category: 'Hortifruti', description: 'Compra de verduras, legumes e frutas', merchant: 'Hortifruti da Vila (exemplo)', products: [
    { name: 'Tomate', unit: 'kg', quantity: 4, price: 699 }, { name: 'Cebola', unit: 'kg', quantity: 2, price: 449 },
    { name: 'Batata', unit: 'kg', quantity: 5, price: 599 }, { name: 'Cenoura', unit: 'kg', quantity: 2, price: 499 },
    { name: 'Alface', unit: 'un', quantity: 5, price: 299 }, { name: 'Cheiro-verde', unit: 'un', quantity: 3, price: 249 },
    { name: 'Banana', unit: 'kg', quantity: 2, price: 549 },
  ] },
  { key: 'acougue', category: 'Açougue', description: 'Compra de carnes para o cardápio', merchant: 'Açougue da Praça (exemplo)', products: [
    { name: 'Carne bovina', unit: 'kg', quantity: 4, price: 3690 }, { name: 'Frango', unit: 'kg', quantity: 5, price: 1490 },
    { name: 'Carne suína', unit: 'kg', quantity: 2, price: 2290 },
  ] },
  { key: 'queijo', category: 'Queijo', description: 'Compra de queijo e laticínios', merchant: 'Laticínios da Serra (exemplo)', products: [
    { name: 'Queijo', unit: 'kg', quantity: 3, price: 3390 }, { name: 'Manteiga', unit: 'kg', quantity: 1, price: 2890 },
  ] },
  { key: 'material', category: 'Material', description: 'Compra de embalagens e material de limpeza', merchant: 'Casa das Embalagens (exemplo)', products: [
    { name: 'Embalagem para marmita', unit: 'un', quantity: 100, price: 55 },
    { name: 'Sacola para delivery', unit: 'un', quantity: 100, price: 18 },
    { name: 'Detergente', unit: 'L', quantity: 5, price: 599 }, { name: 'Água sanitária', unit: 'L', quantity: 5, price: 499 },
    { name: 'Guardanapo', unit: 'pacote', quantity: 5, price: 399, content: { quantity: 100, unit: 'un' } },
  ] },
  { key: 'alho-gas', category: 'Alho/gás', description: 'Compra de alho e gás de cozinha', merchant: 'Distribuidora de Gás e Temperos (exemplo)', products: [
    { name: 'Alho', unit: 'kg', quantity: 2, price: 2490 }, { name: 'Gás de cozinha', unit: 'kg', quantity: 13, price: 850 },
  ] },
];

function requestId(value: string) {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function restaurantDemoSales(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 1) return { totalCents: 0, deliveryMeals: 0, dineInMeals: 0, orderCount: 0 };
  const index = daysBetween(`${date.slice(0,4)}-01-01`, date) - 1;
  const month = Number(date.slice(5,7));
  const deliveryMeals = 30 + month * 2 + (index * 7 % 21) + (weekday >= 5 || weekday === 0 ? 15 : 0);
  const dineInMeals = 32 + month + (index * 11 % 25) + (weekday === 0 ? 22 : 0);
  return { deliveryMeals, dineInMeals, orderCount: Math.ceil(deliveryMeals / 1.6) + Math.ceil(dineInMeals / 1.3),
    totalCents: deliveryMeals * 2200 + dineInMeals * 2800 + (index % 10) * 500 };
}

export async function seedRestaurantDemo(actor: { id: string; empresaId: string }, start: string, end: string) {
  dateValue(start); dateValue(end);
  if (start > end) throw new Error('O início deve ser anterior ao fim.');
  return inTransaction(async client => {
    if ((await findMembership(actor.id, actor.empresaId, client, true))?.role !== 'owner') throw new Error('Selecione uma conta administradora.');
    await lockCatalog(actor.empresaId, client);
    const categories = await listCategories(actor.empresaId, client);
    const categoryIds = new Map<string, string>();
    for (const name of ['Mercado', 'Hortifruti', 'Açougue', 'Moto 1', 'Moto 2', 'Nando', 'Extra Pessoas', 'Queijo', 'Alho/gás', 'Material', 'Fixos']) {
      const existing = categories.find(row => !row.archived && normalizeCatalogName(row.label) === normalizeCatalogName(name));
      categoryIds.set(name, existing?.id ?? (await insertCatalogEntry(actor.empresaId, 'category', name, client)).id);
    }
    const productIds = new Map<string, { id: string; name: string }>();
    for (const purchase of purchases) for (const product of purchase.products) {
      const key = normalizeCatalogName(product.name);
      if (!productIds.has(key)) productIds.set(key, await insertCatalogEntry(actor.empresaId, 'product', product.name, client, product.unit, product.content ?? null));
    }
    const merchantNames = new Map<string, string>();
    for (const name of [...purchases.map(row => row.merchant), 'Entregador Moto 1 (exemplo)', 'Entregador Moto 2 (exemplo)',
      'Nando — cozinha (exemplo)', 'Equipe extra (exemplo)', 'Locador (exemplo)', 'Energia (exemplo)', 'Água (exemplo)', 'Internet (exemplo)']) {
      merchantNames.set(name, (await insertCatalogEntry(actor.empresaId, 'merchant', name, client)).name);
    }
    const today = todayInSaoPaulo();
    let expensesAdded = 0, expensesSkipped = 0, revenueWritten = 0, revenuePreserved = 0, closedMondays = 0;
    const categoryCounts: Record<string, number> = {};
    for (let index = 0; index < daysBetween(start, end); index++) {
      const date = addDays(start, index);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const closed = weekday === 1;
      if (closed) closedMondays++;
      const sales = restaurantDemoSales(date);
      const key = `restaurant-complete-v2:${date}`;
      const result = await client.query(`INSERT INTO daily_revenue (empresa_id,date,amount_cents,delivery_meals,dine_in_meals,order_count,demo_key)
        VALUES ($1,$2::date,$3,$4,$5,$6,$7) ON CONFLICT (empresa_id,date) DO UPDATE
        SET amount_cents=EXCLUDED.amount_cents,delivery_meals=EXCLUDED.delivery_meals,dine_in_meals=EXCLUDED.dine_in_meals,
          order_count=EXCLUDED.order_count,meals_sold=NULL,demo_key=EXCLUDED.demo_key,updated_at=CURRENT_TIMESTAMP
        WHERE (daily_revenue.demo_key IS NOT NULL OR extract(isodow FROM daily_revenue.date)=1)
          AND (daily_revenue.amount_cents,daily_revenue.delivery_meals,daily_revenue.dine_in_meals,daily_revenue.order_count,daily_revenue.meals_sold,daily_revenue.demo_key)
          IS DISTINCT FROM (EXCLUDED.amount_cents,EXCLUDED.delivery_meals,EXCLUDED.dine_in_meals,EXCLUDED.order_count,NULL::integer,EXCLUDED.demo_key)`,
      [actor.empresaId, date, sales.totalCents, sales.deliveryMeals, sales.dineInMeals, sales.orderCount, key]);
      if (result.rowCount) revenueWritten++; else revenuePreserved++;
      const notes = `DADOS FICTÍCIOS. ${date > today ? 'SIMULAÇÃO FUTURA. ' : ''}${closed ? 'Restaurante fechado na segunda-feira; compras para abastecimento, sem vendas. ' : ''}Histórico completo para demonstração.`;
      const plans: { key: string; category: string; description: string; merchant: string; items: ExpenseItem[]; amount: number; method?: 'pix' | 'boleto' }[] = [];
      for (const purchase of purchases) {
        if (purchase.key === 'queijo' && weekday !== 2 && weekday !== 5) continue;
        if (purchase.key === 'material' && weekday !== 3 && weekday !== 6) continue;
        if (purchase.key === 'alho-gas' && weekday !== 2) continue;
        const items = purchase.products.map((product, position) => {
          const registered = productIds.get(normalizeCatalogName(product.name))!;
          const variation = 1 + ((index + position) % 3) * 0.15;
          const quantity = product.unit === 'un' || product.unit === 'pacote' ? Math.ceil(product.quantity * variation) : Math.round(product.quantity * variation * 1000) / 1000;
          return { productId: registered.id, name: registered.name, unit: product.unit, quantity,
            amountCents: Math.round(quantity * demoUnitPrice(product.price, product.name, date)), ...(product.content ? { packageContent: product.content } : {}) };
        });
        plans.push({ ...purchase, items, amount: items.reduce((sum, item) => sum + item.amountCents, 0) });
      }
      if (!closed) {
        for (const moto of [1, 2]) {
          const deliveries = Math.ceil(sales.orderCount * (moto === 1 ? 0.28 : 0.22));
          plans.push({ key: `moto-${moto}`, category: `Moto ${moto}`, description: `Diária e entregas Moto ${moto} — ${deliveries} entregas`,
            merchant: `Entregador Moto ${moto} (exemplo)`, items: [], amount: 4500 + deliveries * 350, method: 'pix' });
        }
        plans.push({ key: 'nando', category: 'Nando', description: 'Diária de Nando — apoio à cozinha', merchant: 'Nando — cozinha (exemplo)', items: [], amount: 12000, method: 'pix' });
        if (weekday === 0 || weekday >= 5) plans.push({ key: 'extra', category: 'Extra Pessoas', description: 'Diárias de equipe extra — cozinha e salão', merchant: 'Equipe extra (exemplo)', items: [], amount: 18000 + (index % 3) * 3000, method: 'pix' });
      }
      const day = Number(date.slice(8));
      const bills: Record<number, { title: string; merchant: string; amount: number }> = {
        5: { title: 'Aluguel mensal do restaurante', merchant: 'Locador (exemplo)', amount: 250000 },
        10: { title: 'Conta mensal de energia', merchant: 'Energia (exemplo)', amount: 68900 + Number(date.slice(5,7)) * 1700 },
        15: { title: 'Conta mensal de água', merchant: 'Água (exemplo)', amount: 18900 + Number(date.slice(5,7)) * 500 },
        20: { title: 'Mensalidade de internet', merchant: 'Internet (exemplo)', amount: 11990 },
      };
      if (bills[day]) plans.push({ key: `fixos-${day}`, category: 'Fixos', description: bills[day].title, merchant: bills[day].merchant, items: [], amount: bills[day].amount, method: 'boleto' });
      for (const [position, plan] of plans.entries()) {
        const demoKey = `${key}:${plan.key}`;
        if ((await client.query('SELECT id FROM expenses WHERE empresa_id=$1 AND demo_key=$2', [actor.empresaId, demoKey])).rowCount) { expensesSkipped++; continue; }
        const input = validateExpense({ description: `${plan.description} (exemplo)`, date, category: categoryIds.get(plan.category),
          merchant: merchantNames.get(plan.merchant), items: plan.items, amountCents: plan.amount,
          status: date > today || (index + position) % 37 === 0 ? 'pending' : 'paid',
          paymentMethod: plan.method ?? PAYMENT_METHODS[1 + (index + position) % (PAYMENT_METHODS.length - 1)].id, notes });
        const saved = await insertExpense(actor.empresaId, actor.id, requestId(`${actor.empresaId}:${demoKey}`), input, client);
        if (!saved.created) { expensesSkipped++; continue; }
        await client.query('UPDATE expenses SET demo_key=$2 WHERE id=$1', [saved.expense.id, demoKey]);
        await insertExpenseAudit(saved.expense, actor.id, 'created', null, { ...input, source: 'restaurant-complete-v2', demoKey }, client);
        expensesAdded++; categoryCounts[plan.category] = (categoryCounts[plan.category] ?? 0) + 1;
      }
    }
    return { start, end, days: daysBetween(start, end), closedMondays, expensesAdded, expensesSkipped, revenueWritten, revenuePreserved, categoryCounts };
  });
}

export async function varyRestaurantDemoPrices(actor: { id: string; empresaId: string }, start: string, end: string) {
  dateValue(start); dateValue(end);
  if (start > end) throw new Error('O início deve ser anterior ao fim.');
  return inTransaction(async client => {
    if ((await findMembership(actor.id, actor.empresaId, client, true))?.role !== 'owner') throw new Error('Selecione uma conta administradora.');
    await lockCatalog(actor.empresaId, client);
    const candidates = (await client.query<{ id: string }>(`SELECT id FROM expenses WHERE empresa_id=$1
      AND date BETWEEN $2::date AND $3::date AND deleted_at IS NULL AND demo_key LIKE 'restaurant-complete-v2:%'
      AND jsonb_array_length(items)>0 ORDER BY id FOR UPDATE`, [actor.empresaId, start, end])).rows;
    const templates = purchases.flatMap(purchase => purchase.products);
    let updated = 0, unchanged = 0, itemsUpdated = 0;
    for (const candidate of candidates) {
      const before = await findExpense(candidate.id, actor.empresaId, client);
      if (!before) continue;
      const oldItems = before.items ?? [];
      let changed = 0;
      const items = oldItems.map(item => {
        const template = templates.find(product => normalizeCatalogName(product.name) === normalizeCatalogName(item.name)
          && product.unit === item.unit && (product.content?.quantity ?? null) === (item.packageContent?.quantity ?? null)
          && (product.content?.unit ?? null) === (item.packageContent?.unit ?? null));
        if (!template) return item;
        const amountCents = Math.round(item.quantity * demoUnitPrice(template.price, template.name, before.date));
        if (amountCents === item.amountCents) return item;
        changed++;
        return { ...item, amountCents };
      });
      if (!changed) { unchanged++; continue; }
      const amountCents = sumCents([before.amountCents, -sumCents(oldItems.map(item => item.amountCents)), sumCents(items.map(item => item.amountCents))]);
      const input = validateExpense({ ...before, amountCents, items });
      const after = await updateExpense(before.id, actor.empresaId, actor.id, input, client);
      await insertExpenseAudit(after, actor.id, 'updated', { ...before }, { ...after, source: 'demo-price-variation-v1' }, client);
      updated++; itemsUpdated += changed;
    }
    return { start, end, purchasesFound: candidates.length, purchasesUpdated: updated, purchasesUnchanged: unchanged, itemsUpdated };
  });
}
