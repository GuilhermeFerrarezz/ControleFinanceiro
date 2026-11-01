import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { expenseWorkbook } from '../src/lib/expense-workbook';
import type { IExpense } from '../src/models/Expense';

const filters={start:'2024-01-01',end:'2024-12-31',category:'',status:'',q:'',page:1};
test('pacote XLSX tem um único filtro e não contém tabelas sobrepostas',async()=>{
  const row={id:'id',description:'Compra',amountCents:123,date:'2024-02-29',category:'alimentos',merchant:'Loja',status:'paid',paymentMethod:'pix',notes:'',authorName:'Autor'} as IExpense;
  for(const rows of [[],[row]]) {
    const zip=await JSZip.loadAsync(await expenseWorkbook(rows,filters,'Restaurante'));
    assert.ok(zip.file('[Content_Types].xml'));
    assert.equal(Object.keys(zip.files).filter(name=>name.startsWith('xl/tables/')).length,0);
    const xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    assert.equal((xml.match(/<autoFilter\b/g)||[]).length,1);
    assert.match(xml,new RegExp(`autoFilter ref="A1:J${rows.length+1}"`));
    assert.doesNotMatch(xml,/<tableParts\b/);
  }
});
test('XLSX vazio permanece legível com totais zerados',async()=>{
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await expenseWorkbook([],filters,'Restaurante')).buffer);
  assert.equal(book.getWorksheet('Lançamentos')!.getCell('A1').text,'Data do gasto');
  assert.equal(book.getWorksheet('Resumo')!.getCell('B8').value,0);
});
test('XLSX preserva centavos, data bissexta e fórmulas como texto',async()=>{
  const row={id:'id',description:'=HYPERLINK("https://example.invalid")',amountCents:9999999999,date:'2024-02-29',category:'alimentos',merchant:'+Fornecedor',status:'pending',paymentMethod:'pix',notes:'@SUM(1,2)',authorName:'Autor'} as IExpense;
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(await expenseWorkbook([row],filters,'=Restaurante')).buffer);
  const sheet=book.getWorksheet('Lançamentos')!;
  assert.equal((sheet.getCell('A2').value as Date).toISOString().slice(0,10),row.date);
  assert.equal(Math.round(Number(sheet.getCell('C2').value)*100),row.amountCents);
  for(const cell of ['B2','E2','I2'])assert.equal(sheet.getCell(cell).type,ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('B2').value,row.description);
  const summary=book.getWorksheet('Resumo')!;
  assert.equal(summary.getCell('B2').type,ExcelJS.ValueType.String);
  assert.equal(summary.getCell('B9').value,0);
  assert.equal(Math.round(Number(summary.getCell('B10').value)*100),row.amountCents);
});
