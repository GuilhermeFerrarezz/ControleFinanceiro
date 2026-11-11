import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRevenueCsv, revenueCsv } from '../src/lib/revenue-csv';

test('CSV de faturamento preserva zero, centavos e datas em exportação e reimportação', () => {
  const rows = [{ date: '2024-02-29', totalCents: 0 }, { date: '2024-03-01', totalCents: 123456 }];
  assert.deepEqual(parseRevenueCsv(revenueCsv(rows)), rows);
});
test('cabeçalhos ambíguos de faturamento são rejeitados sem escolher valores silenciosamente', () => {
  for (const csv of [
    'Data;Data;Faturamento\n01/03/2024;02/03/2024;100,00',
    'Data;Faturamento;Faturamento (R$)\n01/03/2024;100,00;900,00',
    'Data;Faturamento;Faturamento\n01/03/2024;100,00;900,00',
  ]) assert.throws(() => parseRevenueCsv(csv), /colunas repetidas/);
});
