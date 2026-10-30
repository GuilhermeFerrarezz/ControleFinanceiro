import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoSamples } from '../src/lib/demo-data';
import { validateExpense } from '../src/lib/expenses';
test('exemplos cobrem cada mês desde janeiro de 2025 sem datas futuras e mantêm chaves estáveis',()=>{
  const samples=demoSamples('2026-10-30');
  assert.equal(samples.length,396);assert.equal(new Set(samples.map(sample=>sample.key)).size,396);
  assert.equal(new Set(samples.map(sample=>sample.input.date.slice(0,7))).size,22);
  assert.ok(samples.every(sample=>sample.input.date>='2025-01-01' && sample.input.date<='2026-10-30'));
  samples.forEach(sample=>validateExpense(sample.input));
  const early=demoSamples('2025-01-01');assert.equal(early.length,18);
  assert.ok(early.every(sample=>sample.input.date==='2025-01-01'));
  const later=demoSamples('2026-11-02');
  const oldKeys=samples.filter(sample=>sample.input.date<'2026-10-01').map(sample=>sample.key);
  assert.deepEqual(later.filter(sample=>sample.input.date<'2026-10-01').map(sample=>sample.key),oldKeys);
});
