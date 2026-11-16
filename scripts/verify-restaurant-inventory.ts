import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from '../src/lib/db';
import { inTransaction } from '../src/lib/postgres';
import { dateValue } from '../src/lib/expenses';
import { daysBetween, todayInSaoPaulo, type ExpenseItem } from '../src/lib/expense-shared';
import { normalizeIngredient, measuredQuantity, quantityText } from '../src/lib/ingredient-analysis';
import { stockBalance } from '../src/lib/inventory-shared';
import { inventoryProducts } from '../src/models/Inventory';

async function main() {
  const [empresaId, start, end] = process.argv.slice(2);
  assert.match(empresaId || '', /^[0-9a-f-]{36}$/i);
  dateValue(start); dateValue(end); assert.ok(start <= end);
  const report = await inTransaction(async client => {
    const company = (await client.query('SELECT nome FROM empresas WHERE id=$1', [empresaId])).rows[0];
    assert.ok(company, 'Restaurante não encontrado.');
    const expenses = (await client.query<{ id: string; date: string; category: string; demo_key: string | null; items: ExpenseItem[] }>(
      "SELECT id,to_char(date,'YYYY-MM-DD') AS date,category,demo_key,items FROM expenses WHERE empresa_id=$1 AND deleted_at IS NULL", [empresaId])).rows;
    const categories = (await client.query<{ id: string; name: string }>("SELECT id,name FROM restaurant_catalog WHERE empresa_id=$1 AND kind='category' AND deleted_at IS NULL", [empresaId])).rows;
    const categoryNames = new Map(categories.map(item => [item.id, item.name]));
    const labels: Record<string, string> = { mercado: 'Mercado', hortifruti: 'Hortifruti', acougue: 'Açougue', queijo: 'Queijo', material: 'Material', 'alho-gas': 'Alho/gás', 'moto-1': 'Moto 1', 'moto-2': 'Moto 2', nando: 'Nando', extra: 'Extra Pessoas' };
    const counts: Record<string, number> = {};
    let purchases = 0, received = 0, planned = 0, itemCount = 0;
    const demo = expenses.filter(row => row.date >= start && row.date <= end && row.demo_key?.startsWith('restaurant-complete-v2:'));
    for (const row of demo) {
      const key = row.demo_key!.split(':')[2];
      const expectedCategory = key.startsWith('fixos-') ? 'Fixos' : labels[key];
      assert.ok(expectedCategory, `Tipo de lançamento desconhecido: ${row.id}`);
      assert.equal(categoryNames.get(row.category), expectedCategory, `Categoria incorreta: ${row.id}`);
      counts[expectedCategory] = (counts[expectedCategory] || 0) + 1;
      if (expectedCategory !== 'Fixos') assert.notEqual(new Date(`${row.date}T12:00:00Z`).getUTCDay(), 1, `Operação na segunda: ${row.id}`);
      if (['mercado', 'hortifruti', 'acougue', 'queijo', 'material', 'alho-gas'].includes(key)) {
        purchases++; assert.ok(row.items.length, `Compra sem produtos: ${row.id}`);
        const stocked = row.date <= todayInSaoPaulo();
        if (stocked) received++; else planned++;
        for (const item of row.items) {
          itemCount++; assert.ok(item.productId); assert.equal(item.stock === true, stocked, `Recebimento incorreto: ${row.id}`);
        }
      } else assert.equal(row.items.length, 0, `Serviço ou conta com produtos: ${row.id}`);
    }
    const revenues = (await client.query("SELECT to_char(date,'YYYY-MM-DD') AS date,amount_cents,delivery_meals,dine_in_meals,order_count FROM daily_revenue WHERE empresa_id=$1 AND date BETWEEN $2::date AND $3::date ORDER BY date", [empresaId, start, end])).rows;
    assert.equal(revenues.length, daysBetween(start, end), 'Faltam dias no faturamento.');
    const mondays = revenues.filter(row => new Date(`${row.date}T12:00:00Z`).getUTCDay() === 1);
    for (const row of mondays) for (const field of ['amount_cents', 'delivery_meals', 'dine_in_meals', 'order_count']) assert.equal(Number(row[field]), 0, `Segunda com vendas: ${row.date}`);
    const products = await inventoryProducts(empresaId, client);
    const movements = (await client.query<{ product_id: string; quantity: string }>('SELECT product_id,quantity::text FROM inventory_movements WHERE empresa_id=$1', [empresaId])).rows;
    const reconciliation = products.map(product => {
      let expectedReceived = BigInt(0), expectedMovements = BigInt(0);
      for (const expense of expenses) for (const item of expense.items) if (item.stock && item.productId === product.id) {
        const normalized = normalizeIngredient(item);
        if (normalized.unit === product.unit) expectedReceived += measuredQuantity(normalized.quantity);
      }
      for (const movement of movements) if (movement.product_id === product.id) {
        const negative = movement.quantity.startsWith('-');
        expectedMovements += measuredQuantity(negative ? movement.quantity.slice(1) : movement.quantity) * BigInt(negative ? -1 : 1);
      }
      const expected = expectedReceived + expectedMovements;
      assert.ok(expected >= BigInt(0), `Saldo negativo: ${product.name}`);
      assert.equal(stockBalance(product.balance), quantityText(expected), `Saldo divergente: ${product.name}`);
      return { product: product.name, unit: product.unit, received: quantityText(expectedReceived), balance: stockBalance(product.balance), verified: true };
    });
    assert.ok(demo.length > 0 && products.length > 0);
    return { restaurant: company.nome, start, end, days: revenues.length, closedMondays: mondays.length, expenses: demo.length, purchases, receivedPurchases: received, plannedPurchases: planned, purchaseItems: itemCount, categoryCounts: counts, products: reconciliation, verified: true };
  }, true);
  const folder = resolve('reports', `restaurant-demo-${start}-${end}`);
  await mkdir(folder, { recursive: true });
  await writeFile(resolve(folder, 'estoque-verificado.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha na conferência.'); process.exitCode = 1; }).finally(() => db.end());
