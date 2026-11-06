import { parse } from 'csv-parse/sync';
import { csvCell, MAX_CSV_BYTES, MAX_IMPORT_ROWS } from './expense-csv';
import { dateValue } from './expenses';
import { displayDate, parseMoneyInput, type DailyRevenue } from './expense-shared';
import { normalizeCatalogName } from './catalog-shared';
import { InputError } from './validation';

const headers = ['Data', 'Faturamento (R$)'];
export function revenueCsv(rows: DailyRevenue[]) {
  return '\uFEFF' + [headers, ...rows.map(row => [displayDate(row.date), (row.totalCents / 100).toFixed(2).replace('.', ',')])]
    .map(row => row.map(csvCell).join(';')).join('\r\n');
}

export function parseRevenueCsv(value: unknown): DailyRevenue[] {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_CSV_BYTES) {
    throw new InputError('Selecione um CSV de até 2 MB.');
  }
  for (const delimiter of [';', ',', '\t']) {
    let records: string[][];
    try {
      records = parse(value.replace(/^\uFEFF/, '').replace(/^sep=[;,\t]\r?\n/i, ''),
        { delimiter, bom: true, skip_empty_lines: true, max_record_size: 65536, to: MAX_IMPORT_ROWS + 2 });
    } catch { continue; }
    const columns = records[0]?.map(normalizeCatalogName) ?? [];
    const dateIndex = columns.indexOf('data');
    const amountIndex = columns.findIndex(name => name === 'faturamento' || name === 'faturamento (r$)');
    if (dateIndex < 0 || amountIndex < 0) continue;
    if (records.length < 2 || records.length > MAX_IMPORT_ROWS + 1) {
      throw new InputError(`O CSV deve conter entre 1 e ${MAX_IMPORT_ROWS} dias de faturamento.`);
    }
    const dates = new Set<string>();
    return records.slice(1).map((row, index) => {
      try {
        const rawDate = row[dateIndex].trim();
        const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
        const date = dateValue(br ? `${br[3]}-${br[2]}-${br[1]}` : rawDate);
        const rawAmount = row[amountIndex].trim().replace(/^R\$\s*/, '');
        const totalCents = parseMoneyInput(rawAmount.replace(/^(\d+)\.(\d{1,2})$/, '$1,$2'), true);
        if (totalCents === null) throw new InputError('Informe um valor de faturamento válido, como 125,90 ou 0,00.');
        if (dates.has(date)) throw new InputError('Informe apenas um total por dia.');
        dates.add(date);
        return { date, totalCents };
      } catch (error) {
        if (!(error instanceof InputError)) throw error;
        throw new InputError(`Registro ${index + 1}: ${error.message}`);
      }
    });
  }
  throw new InputError('Não foi possível ler o CSV. Use as colunas Data e Faturamento (R$).');
}
