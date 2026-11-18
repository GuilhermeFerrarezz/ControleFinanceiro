import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityLimitError, trustedClientAddress, withPasswordBudget } from '../src/lib/security-limits';
import { dashboardPdf } from '../src/lib/dashboard-pdf';
import { expenseWorkbook } from '../src/lib/expense-workbook';
import { pdfFixture } from './pdf-fixture';
import type { IExpense } from '../src/models/Expense';

test('não confia em IP encaminhado sem configuração e rejeita listas ou valores inválidos', () => {
  const request = new Request('https://app.example.com', { headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '2001:0db8:0:0:0:0:0:1' } });
  assert.equal(trustedClientAddress(request, ''), null);
  assert.equal(trustedClientAddress(request, 'x-real-ip'), '[2001:db8::1]');
  assert.equal(trustedClientAddress(new Request('https://app.example.com', { headers: { 'x-real-ip': '192.0.2.1' } }), 'x-real-ip'), '192.0.2.1');
  for (const value of ['attacker.invalid', '1.2.3.4, 5.6.7.8', '']) {
    assert.throws(() => trustedClientAddress(new Request('https://app.example.com', { headers: { 'x-real-ip': value } }), 'x-real-ip'));
  }
});

test('na Vercel usa o IP fornecido pela plataforma para login, cadastro e recuperação', t => {
  const before = process.env.VERCEL;
  t.after(() => { if (before === undefined) delete process.env.VERCEL; else process.env.VERCEL = before; });
  process.env.VERCEL = '1';
  const headers = { 'x-vercel-forwarded-for': '192.0.2.7', 'x-forwarded-for': '192.0.2.20' };
  assert.equal(trustedClientAddress(new Request('https://app.example.com', { headers })), '192.0.2.7');
  assert.throws(() => trustedClientAddress(new Request('https://app.example.com')));
});

test('bcrypt tem concorrência limitada e libera a capacidade inclusive após falhas', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const running = Array.from({ length: 8 }, () => withPasswordBudget(() => gate));
  await assert.rejects(withPasswordBudget(async () => true), SecurityLimitError);
  release(); await Promise.all(running);
  await assert.rejects(withPasswordBudget(async () => { throw new Error('falha simulada'); }));
  assert.equal(await withPasswordBudget(async () => true), true);
});

test('PDF e Excel recusam custo excessivo antes de alocar o documento', async () => {
  const data = pdfFixture('2026-01-01', '2026-01-31');
  const product = { name: 'Arroz', quantity: 1, unit: 'kg' as const, amountCents: 100, purchases: 1 };
  data.products = Array.from({ length: 251 }, () => product);
  await assert.rejects(dashboardPdf(data, 'Teste', 'Autor'), /PDF está muito grande/);
  const row = { items: Array.from({ length: 50 }, () => product) } as unknown as IExpense;
  await assert.rejects(expenseWorkbook(Array.from({ length: 300 }, () => row), data.filters, 'Teste'), /Excel está muito grande/);
});
