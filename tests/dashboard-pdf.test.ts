import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardPdf } from '../src/lib/dashboard-pdf';
import { pdfFixture } from './pdf-fixture';
import { addDays, type ProductTotal } from '../src/lib/expense-shared';

test('PDF pagina todos os valores diários, mensais e anuais sem páginas extras',async()=>{
  for(const [start,end,interval,pages] of [
    ['2026-01-01','2026-01-17','day',2],
    ['2026-01-01','2026-01-18','day',3],
    ['2026-01-01','2026-03-31','day',7],
    ['2026-01-01','2026-12-31','month',2],
    ['2000-01-01','2100-12-31','year',7],
  ] as const) {
    const data=pdfFixture(start,end);
    assert.equal(data.seriesInterval,interval);
    assert.equal(data.series.reduce((sum,row)=>sum+row.totalCents,0),data.summary.totalCents);
    const bytes=Buffer.from(await dashboardPdf(data,'Restaurante de teste','Responsável'));
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,pages);
  }
});
test('PDF sem gastos mantém os dias com total zero',async()=>{
  const data=pdfFixture('2026-01-01','2026-01-18',true);
  assert.equal(data.series.length,18);
  const bytes=Buffer.from(await dashboardPdf(data,'Restaurante','Responsável'));
  assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,3);
});

test('PDF inclui todos os insumos e pagina gráficos, tabelas e observações extensas', async () => {
  const data = pdfFixture('2026-01-01', '2026-01-18');
  const base = Buffer.from(await dashboardPdf(data, 'Restaurante', 'Responsável'));
  data.products = Array.from({ length: 35 }, (_, index): ProductTotal => ({
    productId: `product-${index}`, name: `Insumo ${index + 1} com nome completo para conferência de paginação e medidas`,
    unit: 'kg', quantity: 2, quantityText: '2', amountCents: 2000, purchases: 2, averagePriceCents: '1000',
    recentPrices: [{ date: '2026-01-18', quantity: '1', amountCents: 1200, priceCents: '1200' },
      { date: '2026-01-01', quantity: '1', amountCents: 800, priceCents: '800' }],
  }));
  data.productDaily = data.products.flatMap(item => [{ date: '2026-01-01', productId: item.productId!, name: item.name, totalCents: 800 },
    { date: '2026-01-18', productId: item.productId!, name: item.name, totalCents: 1200 }]);
  data.ingredientDaily = data.productDaily.map(item => ({ ...item, unit: 'kg', quantity: '1' }));
  data.expenses = [{ id: 'expense', date: '2026-01-18', description: 'Compra de mercado detalhada', amountCents: 2000,
    items: [{ name: data.products[0].name, productId: 'product-0', unit: 'kg', quantity: 2, amountCents: 2000 }],
    merchant: 'Mercado', category: 'alimentos', status: 'paid', paymentMethod: 'pix', authorName: 'Responsável',
    createdBy: 'user', canManage: true, isDemo: true, version: 1, createdAt: '2026-01-18T12:00:00Z',
    notes: Array.from({ length: 80 }, (_, index) => `Observação ${index}: conferir todos os produtos e valores.`).join(' ') }];
  const rich = Buffer.from(await dashboardPdf(data, 'Restaurante com produtos', 'Responsável'));
  const count = (bytes: Buffer) => (bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.ok(count(rich) >= count(base) + Math.ceil(data.products.length / 2) + 4);
  assert.ok(count(rich) < count(base) + 35, 'tabelas e gráficos não devem criar páginas vazias');
  // Also exercise sparse price series and a single purchase without comparison.
  data.products = [{ ...data.products[0], recentPrices: data.products[0].recentPrices!.slice(0, 1) }];
  data.ingredientDaily = [{ productId: 'product-0', date: addDays(data.filters.start, 3), unit: 'kg', quantity: '2', totalCents: 2000 }];
  assert.equal(Buffer.from(await dashboardPdf(data, 'Restaurante', 'Responsável')).subarray(0, 5).toString(), '%PDF-');
});
