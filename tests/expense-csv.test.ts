import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { csvTemplate,expenseCsv,parseExpenseCsv,csvCell } from '../src/lib/expense-csv';
import type { IExpense } from '../src/models/Expense';
import { decodeCsv } from '../src/lib/csv-encoding';
const company=randomUUID();
test('decodifica arquivos do Excel em UTF-16 e Windows-1252',()=>{
  const original=csvTemplate();
  const le=Buffer.from(original,'utf16le');
  const be=Buffer.from(le).swap16();
  for(const bytes of [le,be]) {
    const decoded=decodeCsv(Uint8Array.from(bytes).buffer);
    assert.equal(parseExpenseCsv(decoded,company).rows[0].input.description,'Compra de hortifruti');
  }
  assert.equal(decodeCsv(Uint8Array.from([0x61,0xe7,0xe3,0x6f]).buffer),'ação');
});
test('limita registros e rejeita caracteres nulos antes de gravar',()=>{
  const header='Data;Descrição;Valor;Categoria\n';
  const row='12/01/2030;Compra;10;Alimentos\n';
  assert.equal(parseExpenseCsv(header+row.repeat(2000),company).rows.length,2000);
  assert.throws(()=>parseExpenseCsv(header+row.repeat(2001),company),/2000/);
  assert.equal(parseExpenseCsv(header+row.replace('Compra','Com\0pra'),company).issues.length,1);
});
test('proteção de fórmulas conserva textos e apóstrofos em exportações repetidas',()=>{
  for(const description of ['=1+1','+Fornecedor','-Mercado','@Pessoa',"'Texto", "'=1+1", '='.repeat(120)]) {
    const row={id:randomUUID(),description,amountCents:100,date:'2030-01-12',category:'alimentos',merchant:"'Local",status:'paid',paymentMethod:'pix',notes:'=NOTA',authorName:'Autor'} as IExpense;
    const parsed=parseExpenseCsv(expenseCsv([row]),company);
    assert.deepEqual(parsed.issues,[]);
    assert.equal(parsed.rows[0].input.description,description);
    assert.equal(parsed.rows[0].input.merchant,row.merchant);
    assert.equal(parsed.rows[0].input.notes,row.notes);
  }
});
test('ID externo mantém a identidade quando o conteúdo muda',()=>{
  const id=randomUUID();
  const csv=`Data;Descrição;Valor;Categoria;ID\n12/01/2030;Compra;10;Alimentos;${id}`;
  assert.equal(parseExpenseCsv(csv,company).rows[0].requestId,parseExpenseCsv(csv.replace(';10;',';20;'),company).rows[0].requestId);
});
test('modelo CSV e variações de separador, data e valor são reconhecidos',()=>{
  const sample=parseExpenseCsv(csvTemplate(),company);assert.equal(sample.issues.length,0);assert.equal(sample.rows[0].input.amountCents,12590);
  const csv='Data,Descrição,Valor,Categoria,Local,Situação,Pagamento\n2030-01-12,"Compra, com vírgula",99.90,alimentos,Mercado,Pendente,PIX';
  const result=parseExpenseCsv(csv,company);assert.equal(result.issues.length,0);assert.equal(result.rows[0].input.status,'pending');assert.equal(result.rows[0].input.amountCents,9990);
  const br='Data;Descrição;Valor;Categoria\r\n12/01/2030;Compra local;1.234,56;Alimentos';
  assert.equal(parseExpenseCsv(br,company).rows[0].input.amountCents,123456);
});
test('CSV exportado conserva datas legíveis, acentos, aspas, notas e IDs para reimportação',()=>{
  const row:IExpense={id:randomUUID(),empresaId:company,createdBy:randomUUID(),updatedBy:randomUUID(),requestId:randomUUID(),description:'Compra de açúcar',amountCents:12590,date:'2024-02-29',category:'alimentos',merchant:'Mercado; do Bairro',status:'paid',paymentMethod:'pix',notes:'Texto com "aspas"\ne quebra',version:1,createdAt:new Date().toISOString(),deletedAt:null,authorName:'Pessoa responsável',isDemo:false};
  const exported=expenseCsv([row]);assert.ok(exported.startsWith('\uFEFF'));assert.match(exported,/Data: 29\/02\/2024/);
  const parsed=parseExpenseCsv(exported,company);assert.equal(parsed.issues.length,0);assert.equal(parsed.rows[0].sourceId,row.id);assert.equal(parseExpenseCsv(exported.replace(row.id,row.id.toUpperCase()),company).rows[0].sourceId,row.id);
  assert.equal(parsed.rows[0].input.date,row.date);assert.equal(parsed.rows[0].input.notes,row.notes);assert.equal(parsed.rows[0].input.merchant,row.merchant);
  assert.equal(csvCell('=HYPERLINK("teste")'),'"\'=HYPERLINK(""teste"")"');
});
test('validação identifica erros por linha e não interpreta datas ilegíveis nem fórmulas',()=>{
  const csv='Data;Descrição;Valor;Categoria\n31/02/2026;Compra;20,00;Alimentos\n#######;Compra;20,00;Alimentos\n12/01/2030;Compra;-10,00;Alimentos\n12/01/2030;Compra;10,00;Inexistente';
  const result=parseExpenseCsv(csv,company);assert.equal(result.rows.length,0);assert.deepEqual(result.issues.map(issue=>issue.line),[2,3,4,5]);
  assert.throws(()=>parseExpenseCsv('Data;Descrição;Valor;Categoria;Categoria\n12/01/2030;Compra;10;Alimentos;Alimentos',company),/repetidas/);
  assert.throws(()=>parseExpenseCsv('Data;Descrição;Valor;Categoria\n"texto sem fechar',company));
  assert.throws(()=>parseExpenseCsv('x'.repeat(2*1024*1024+1),company),/2 MB/);
});
test('identificadores de importação são estáveis e preservam repetições legítimas dentro do arquivo',()=>{
  const csv='Data;Descrição;Valor;Categoria\n12/01/2030;Compra;10,00;Alimentos\n12/01/2030;Compra;10,00;Alimentos';
  const first=parseExpenseCsv(csv,company),second=parseExpenseCsv(csv,company);
  assert.equal(first.rows[0].requestId,second.rows[0].requestId);assert.notEqual(first.rows[0].requestId,first.rows[1].requestId);
  assert.notEqual(first.rows[0].requestId,parseExpenseCsv(csv,randomUUID()).rows[0].requestId);
});
