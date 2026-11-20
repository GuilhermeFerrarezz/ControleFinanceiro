import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordValue } from '../src/lib/validation';
import { passwordRequirements } from '../src/lib/password-policy';
import { validateStockItems } from '../src/lib/inventory';
import type { ExpenseInput } from '../src/lib/expense-shared';
import type { Queryable } from '../src/lib/postgres';
import { db } from '../src/lib/db';
import { withImportBudget, SecurityLimitError } from '../src/lib/security-limits';
import { migrateDatabase } from '../src/lib/migrations';
import type { Pool } from 'pg';

test('senhas novas exigem 8 caracteres, maiúscula e símbolo; login legado permanece compatível', () => {
  assert.throws(() => passwordValue('Abcdef!', true), /8 caracteres/);
  assert.throws(() => passwordValue('abcdefg!', true), /maiúscula/);
  for (const value of ['Abcdefgh', 'Abcdefg ', 'Abcdefg1']) assert.throws(() => passwordValue(value, true), /símbolo/);
  for (const value of ['Abcdefg!', 'Ábcdefg@', 'Senha com espaços!']) assert.equal(passwordValue(value, true), value);
  assert.throws(() => passwordValue('A😀😀😀!', true), /8 caracteres/);
  assert.deepEqual(passwordRequirements(''), { length: false, uppercase: false, symbol: false });
  assert.deepEqual(passwordRequirements('abcdefgh'), { length: true, uppercase: false, symbol: false });
  assert.deepEqual(passwordRequirements('Abcdefgh'), { length: true, uppercase: true, symbol: false });
  assert.deepEqual(passwordRequirements('Abcdefg!'), { length: true, uppercase: true, symbol: true });
  assert.equal(passwordValue('123456'), '123456');
  assert.throws(() => passwordValue('é'.repeat(37), true), /longa/);
});

test('estoque valida 50 itens em duas consultas e recusa unidades conflitantes', async () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const item = { productId, name: 'Arroz', stock: true, unit: 'kg' as const, quantity: 1, amountCents: 100 };
  let queries = 0;
  let storedUnit = 'kg';
  const client = { query: async (sql: string, values: unknown[]) => {
    queries++;
    assert.equal(values[0], 'restaurant');
    assert.deepEqual(values[1], [productId]);
    return { rows: sql.startsWith('SELECT') ? [{ product_id: productId, unit: storedUnit }] : [] };
  } } as unknown as Queryable;
  const input = { items: Array.from({ length: 50 }, () => ({ ...item })) } as ExpenseInput;
  await validateStockItems('restaurant', input, client);
  assert.equal(queries, 2);
  storedUnit = 'L';
  await assert.rejects(validateStockItems('restaurant', input, client), /controlado em L/);
  queries = 0;
  await assert.rejects(validateStockItems('restaurant', { ...input, items: [item, { ...item, unit: 'L' }] }, client), /unidades de estoque diferentes/);
  assert.equal(queries, 0, 'recusa o conflito antes de gravar');
});

test('importações reservam capacidade antes do primeiro await e liberam após erro', async t => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(db, 'query', async () => { await gate; return { rows: [{ count: 1 }] }; });
  const pending = [withImportBudget('one', async () => true), withImportBudget('two', async () => true)];
  let processed = false;
  await assert.rejects(withImportBudget('three', async () => { processed = true; }), SecurityLimitError);
  assert.equal(processed, false);
  release(); await Promise.all(pending);
  await assert.rejects(withImportBudget('one', async () => { throw new Error('falha simulada'); }), /simulada/);
  assert.equal(await withImportBudget('one', async () => true), true);
});

test('migração descarta conexão inclusive quando o rollback falha', async () => {
  for (const fails of [false, true]) {
    let discarded = false;
    const pool = { connect: async () => ({
      query: async (sql: string) => { if (fails && !sql.startsWith('SET')) throw new Error('falha simulada'); },
      release: (destroy: boolean) => { discarded = destroy; },
    }) } as unknown as Pool;
    if (fails) await assert.rejects(migrateDatabase(pool), /simulada/);
    else await migrateDatabase(pool);
    assert.equal(discarded, true);
  }
});
