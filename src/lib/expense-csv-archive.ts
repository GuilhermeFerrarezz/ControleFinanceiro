import JSZip from 'jszip';
import { CSV_HEADERS, csvCell, expenseCsvLine, MAX_CSV_BYTES, MAX_IMPORT_ROWS } from './expense-csv';
import type { IExpense } from '../models/Expense';
import { iterateExpenses } from '../models/Expense';
import { inTransaction } from './postgres';
import { InputError } from './validation';
import { sumCents } from './financial-math';
import type { ExpenseActor } from './expenses';
import type { ExpenseFilters } from './expense-shared';

export const MAX_ARCHIVE_ROWS = 100_000;
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
export async function expenseCsvParts(rows: AsyncIterable<IExpense> | Iterable<IExpense>) {
  const header = '\uFEFF' + CSV_HEADERS.map(csvCell).join(';');
  const headerBytes = Buffer.byteLength(header, 'utf8');
  const parts: { csv: string; rows: number; bytes: number; totalCents: number }[] = [];
  let lines: string[] = [], bytes = headerBytes, count = 0, totalBytes = 0, totalCents = 0;
  function flush() {
    if (!lines.length) return;
    parts.push({ csv: header + '\r\n' + lines.join('\r\n'), rows: lines.length, bytes, totalCents });
    totalBytes += bytes;
    if (totalBytes > MAX_ARCHIVE_BYTES) throw new InputError('O ZIP excede 64 MB de dados CSV. Reduza o período ou aplique filtros.');
    lines = []; bytes = headerBytes; totalCents = 0;
  }
  for await (const row of rows) {
    if (++count > MAX_ARCHIVE_ROWS) throw new InputError('O ZIP permite até 100 mil gastos. Reduza o período ou aplique filtros.');
    const line = expenseCsvLine(row), size = Buffer.byteLength('\r\n' + line, 'utf8');
    if (headerBytes + size > MAX_CSV_BYTES) throw new InputError('Um lançamento excede o tamanho permitido por CSV. Reduza o detalhamento desse gasto.');
    if (lines.length >= MAX_IMPORT_ROWS || bytes + size > MAX_CSV_BYTES) flush();
    lines.push(line); bytes += size; totalCents = sumCents([totalCents, row.amountCents]);
    if (totalBytes + bytes > MAX_ARCHIVE_BYTES) throw new InputError('O ZIP excede 64 MB de dados CSV. Reduza o período ou aplique filtros.');
  }
  flush(); return parts;
}
export async function expenseCsvArchive(actor: ExpenseActor, filters: ExpenseFilters) {
  const parts = await inTransaction(client => expenseCsvParts(iterateExpenses(actor.empresaId, filters, client)), true);
  const zip = new JSZip();
  const manifest = parts.map((part, index) => {
    const name = `gastos-${filters.start}-${filters.end}-parte-${String(index + 1).padStart(4, '0')}.csv`;
    zip.file(name, part.csv); return { arquivo: name, lancamentos: part.rows, bytes: part.bytes, totalCentavos: part.totalCents };
  });
  zip.file('LEIA-ME.txt', 'CSVs prontos para reimportar no Saldo da Casa.\r\nExtraia o ZIP e importe um CSV de cada vez em Lançamentos > Importar gastos CSV.\r\nCada parte tem até 2.000 lançamentos e 2 MB em UTF-8, com cabeçalho próprio.\r\nIDs e produtos foram preservados; reenvios seguem a proteção contra duplicidade.\r\nSe necessário, aprove o cadastro de categorias na prévia.\r\nNenhum lançamento encontrado? O ZIP contém apenas este guia e o manifesto.\r\n');
  zip.file('manifesto.json', JSON.stringify({ periodo: { inicio: filters.start, fim: filters.end }, filtros: filters, lancamentos: manifest.reduce((sum, part) => sum + part.lancamentos, 0), totalCentavos: sumCents(manifest.map(part => part.totalCentavos)), partes: manifest }, null, 2));
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 3 } }));
}
