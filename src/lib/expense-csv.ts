import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { InputError, textValue } from './validation';
import { dateValue, validateExpense, type ExpenseActor } from './expenses';
import { categoryInfo, displayDate, EXPENSE_CATEGORIES, PAYMENT_METHODS, parseMoneyInput, type CategoryOption, type ExpenseInput } from './expense-shared';
import { listCategories, insertCatalogEntry, lockCatalog } from '../models/Catalog';
import { normalizeCatalogName } from './catalog-shared';
import { db } from './db';
import { inTransaction, type Queryable } from './postgres';
import { existingImportKeys, insertImportedExpenses, restoreImportedExpense, type IExpense } from '../models/Expense';
import { findMembership } from '../models/Membership';

export const MAX_IMPORT_ROWS=2000;
export const MAX_CSV_BYTES=2*1024*1024;
export const CSV_HEADERS=['Data do gasto','Descrição','Valor (R$)','Categoria','Local de compra / favorecido','Situação','Forma de pagamento','Lançado por','Observações','ID do lançamento'];
const escapedCsvText = /^[\s]*[=+@\-\t\r\n']/;
export const csvCell=(value:string)=>`"${(escapedCsvText.test(value)?"'":'')+value.replaceAll('"','""')}"`;
export function expenseCsv(rows:IExpense[]) {
  const lines=[CSV_HEADERS,...rows.map(row=>[
    `Data: ${displayDate(row.date)}`,row.description,(row.amountCents/100).toFixed(2).replace('.',','),
    row.categoryLabel || categoryInfo(row.category).label,row.merchant,row.status==='paid'?'Pago':'A pagar',
    PAYMENT_METHODS.find(item=>item.id===row.paymentMethod)!.label,row.authorName,row.notes,row.id,
  ])];
  return '\uFEFF'+lines.map(line=>line.map(csvCell).join(';')).join('\r\n');
}
export function csvTemplate() {
  return '\uFEFF'+[
    CSV_HEADERS.filter(header=>!['Lançado por','ID do lançamento'].includes(header)),
    ['15/01/2025','Compra de hortifruti','125,90','Alimentos','Feira do Bairro','Pago','Pix','Compra da cozinha'],
  ].map(row=>row.map(csvCell).join(';')).join('\r\n');
}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const headerAliases:Record<string,string>={
  data:'date',datadogasto:'date',date:'date',descricao:'description',description:'description',gasto:'description',
  valor:'amount',valorr:'amount',amount:'amount',categoria:'category',category:'category',
  local:'merchant',localfavorecido:'merchant',localdecomprafavorecido:'merchant',localdecompra:'merchant',merchant:'merchant',
  situacao:'status',status:'status',pagamento:'paymentMethod',formadepagamento:'paymentMethod',paymentmethod:'paymentMethod',
  observacoes:'notes',notes:'notes',iddolancamento:'sourceId',id:'sourceId',
};
export interface ImportRow { line:number; input:ExpenseInput; requestId:string; legacyRequestId?:string; sourceId:string | null }
export interface CsvIssue { line:number; message:string }
function importDate(value:string) {
  const text=value.trim().replace(/^'/,'').replace(/^data:\s*/i,'');
  const br=/^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text);
  return dateValue(br?`${br[3]}-${br[2]}-${br[1]}`:text);
}
function importAmount(value:string) {
  let text=value.trim().replace(/^R\$\s*/,'');
  if(/^\d+\.\d{1,2}$/.test(text))text=text.replace('.',',');
  else if(/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text))text=text.replaceAll(',','').replace('.',',');
  const amount=parseMoneyInput(text);
  if(amount===null)throw new InputError('Informe um valor positivo, como 125,90.');
  return amount;
}
function requestUuid(value:string) {
  const bytes=createHash('sha256').update(value).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function parseExpenseCsv(csv:unknown,empresaId:string,categories:readonly CategoryOption[]=EXPENSE_CATEGORIES) {
  if(typeof csv!=='string' || !csv.trim())throw new InputError('Selecione um arquivo CSV com lançamentos.');
  if(Buffer.byteLength(csv,'utf8')>MAX_CSV_BYTES)throw new InputError('O CSV deve ter até 2 MB.');
  const text=csv.replace(/^\uFEFF/,'').replace(/^sep=[;,\t]\r?\n/i,'');
  let records:{record:string[];info:{lines:number}}[]=[];
  let mapping:(string|undefined)[]=[];
  for(const delimiter of [';',',','\t']) {
    try {
      const candidate=parse(text,{delimiter,bom:true,skip_empty_lines:true,relax_column_count:true,max_record_size:65536,info:true,to:MAX_IMPORT_ROWS+2}) as unknown as typeof records;
      const names=candidate[0]?.record.map(header=>headerAliases[normalize(header)])||[];
      if(['date','description','amount','category'].every(name=>names.includes(name))) {records=candidate;mapping=names;break;}
    } catch { /* Try another supported separator. */ }
  }
  if(!records.length)throw new InputError('Não foi possível ler o CSV. Use as colunas Data, Descrição, Valor e Categoria e separe por ponto e vírgula, vírgula ou tabulação. Confira as aspas.');
  const fields=mapping.filter(Boolean);
  if(new Set(fields).size!==fields.length)throw new InputError('O CSV possui colunas repetidas. Use uma coluna para cada campo.');
  if(records.length<2)throw new InputError('O CSV não contém lançamentos.');
  if(records.length-1>MAX_IMPORT_ROWS)throw new InputError(`Importe até ${MAX_IMPORT_ROWS} lançamentos por arquivo.`);
  const systemExport=records[0].record.length===CSV_HEADERS.length && records[0].record.every((header,index)=>header===CSV_HEADERS[index]);
  const rows:ImportRow[]=[],issues:CsvIssue[]=[],occurrences=new Map<string,number>(),unknownCategories=new Map<string,string>();
  for(const {record,info} of records.slice(1)) {
    if(record.every(value=>!value.trim()))continue;
    try {
      if(record.length!==mapping.length)throw new InputError('A quantidade de campos é diferente do cabeçalho. Confira os separadores e as aspas.');
      const data:Record<string,string>={};mapping.forEach((name,index)=>{if(name)data[name]=record[index].trim();});
      // Only undo our reversible text escaping for the system's export format.
      if(systemExport)for(const name of ['description','merchant','notes','category']) {
        if(data[name]?.startsWith("'") && escapedCsvText.test(data[name].slice(1)))data[name]=data[name].slice(1);
      }
      const category=categories.find(item=>normalizeCatalogName(item.id)===normalizeCatalogName(data.category)||normalizeCatalogName(item.label)===normalizeCatalogName(data.category));
      if(!category) { const name=textValue(data.category,'A categoria'); unknownCategories.set(normalizeCatalogName(name),name); throw new InputError(`Categoria não cadastrada: ${name}. Autorize o cadastro abaixo ou corrija a planilha.`); }
      const status=normalize(data.status||'Pago');
      const paid=['pago','pagos','paid'].includes(status),pending=['apagar','pendente','pendentes','pending'].includes(status);
      if(!paid&&!pending)throw new InputError('Situação inválida. Use Pago ou A pagar.');
      const method=PAYMENT_METHODS.find(item=>normalize(item.id)===normalize(data.paymentMethod||'not_informed')||normalize(item.label)===normalize(data.paymentMethod||'Não informado'));
      if(!method)throw new InputError('Forma de pagamento desconhecida. Confira o modelo.');
      const input=validateExpense({description:data.description,amountCents:importAmount(data.amount),date:importDate(data.date),category:category.id,merchant:data.merchant||'',status:paid?'paid':'pending',paymentMethod:method.id,notes:data.notes||''});
      const sourceId=data.sourceId?.toLowerCase()||null;
      if(sourceId&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(sourceId))throw new InputError('ID do lançamento inválido. Deixe vazio para criar um novo gasto.');
      const canonical=JSON.stringify(input),occurrence=occurrences.get(canonical)||0;occurrences.set(canonical,occurrence+1);
      const legacyRequestId=requestUuid(`csv:v1:${empresaId}:${canonical}:${occurrence}`);
      rows.push({line:info.lines,input,sourceId,legacyRequestId,requestId:sourceId?requestUuid(`csv:source:${empresaId}:${sourceId}`):legacyRequestId});
    } catch(error) {issues.push({line:info.lines,message:error instanceof InputError?error.message:'Dados inválidos nesta linha.'});}
  }
  if(!rows.length&&!issues.length)throw new InputError('O CSV não contém lançamentos.');
  return {rows,issues,unknownCategories:[...unknownCategories.values()]};
}
async function classify(rows:ImportRow[],actor:ExpenseActor,client:Queryable,lock=false) {
  const existing=await existingImportKeys(actor.empresaId,rows.flatMap(row=>row.sourceId?[row.sourceId]:[]),rows.flatMap(row=>row.legacyRequestId?[row.requestId,row.legacyRequestId]:[row.requestId]),client,lock);
  const ids=new Map(existing.map(row=>[row.id,row])),keys=new Map(existing.map(row=>[row.requestId,row]));
  const seen=new Set<string>();
  return rows.map(row=>{
    const matches=[row.sourceId?ids.get(row.sourceId):undefined,keys.get(row.requestId),row.legacyRequestId?keys.get(row.legacyRequestId):undefined].filter(item=>item!==undefined);
    const target=matches.find(item=>!item.deletedAt)||matches[0];
    const identity=target?.id||row.requestId;
    const duplicate=!!(target&&!target.deletedAt)||seen.has(identity)||seen.has(row.requestId);
    seen.add(identity);seen.add(row.requestId);
    const restoreId=!duplicate&&target?.deletedAt?target.id:null;
    const forbidden=!!restoreId&&actor.role!=='owner'&&target?.createdBy!==actor.id;
    return {...row,duplicate,restoreId,forbidden};
  });
}
function categorySelection(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_IMPORT_ROWS) throw new InputError('Seleção de categorias inválida.');
  return [...new Set(value.map(item => normalizeCatalogName(textValue(item, 'A categoria'))))];
}
function proposedCategories(csv: unknown, empresaId: string, categories: CategoryOption[], selected: string[]) {
  const unknown = parseExpenseCsv(csv, empresaId, categories).unknownCategories;
  return { unknown, proposed: unknown.filter(name => selected.includes(normalizeCatalogName(name))).map(name => ({
    id: requestUuid(`catalog-import:${empresaId}:${normalizeCatalogName(name)}`), label: name, color: '#749da0',
  })) };
}
export async function previewExpenseCsv(actor:ExpenseActor,csv:unknown,createCategories?:unknown) {
  const allCategories=await listCategories(actor.empresaId);
  const categories=allCategories.filter(item => !item.archived);
  const {unknown,proposed}=proposedCategories(csv,actor.empresaId,categories,categorySelection(createCategories));
  const options=[...categories,...proposed.map(item => {
    const archived=allCategories.find(old => old.archived && normalizeCatalogName(old.label)===normalizeCatalogName(item.label));
    return archived ? {...item,id:archived.id} : item;
  })];
  const parsed=parseExpenseCsv(csv,actor.empresaId,options),rows=await classify(parsed.rows,actor,db);
  const total=rows.length+parsed.issues.length;
  for(const row of rows)if(row.forbidden)parsed.issues.push({line:row.line,message:'Apenas o dono ou o autor pode restaurar este gasto excluído.'});
  return { unknownCategories:unknown, total,ready:rows.filter(row=>!row.duplicate&&!row.forbidden).length,duplicates:rows.filter(row=>row.duplicate).length,
    totalErrors:parsed.issues.length,errors:parsed.issues.slice(0,30),preview:rows.slice(0,10).map(row=>({line:row.line,...row.input,categoryLabel:categoryInfo(row.input.category,options).label,duplicate:row.duplicate})),
    totalCents:rows.filter(row=>!row.duplicate&&!row.forbidden).reduce((sum,row)=>sum+row.input.amountCents,0) };
}
export async function importExpenseCsv(actor:ExpenseActor,csv:unknown,createCategories?:unknown) {
  const selected=categorySelection(createCategories);
  return inTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`csv-import:${actor.empresaId}`]);
    const member=await findMembership(actor.id,actor.empresaId,client,true);
    if(!member)throw new InputError('Você não tem mais acesso a este restaurante.');
    await lockCatalog(actor.empresaId,client);
    const categories=(await listCategories(actor.empresaId,client)).filter(item => !item.archived);
    const {proposed}=proposedCategories(csv,actor.empresaId,categories,selected);
    for(const category of proposed) await insertCatalogEntry(actor.empresaId,'category',category.label,client);
    const parsed=parseExpenseCsv(csv,actor.empresaId,(await listCategories(actor.empresaId,client)).filter(item => !item.archived));
    if(parsed.issues.length)throw new InputError(`Corrija o CSV antes de importar. Linha ${parsed.issues[0].line}: ${parsed.issues[0].message}`);
    const rows=await classify(parsed.rows,{...actor,role:member.role},client,true);
    if(rows.some(row=>row.forbidden))throw new InputError('Apenas o dono ou o autor pode restaurar um gasto excluído.');
    let imported=await insertImportedExpenses(actor.empresaId,actor.id,rows.filter(row=>!row.duplicate&&!row.restoreId),client);
    for(const row of rows)if(row.restoreId&&await restoreImportedExpense(row.restoreId,actor.empresaId,actor.id,row.input,client))imported++;
    const dates=rows.map(row=>row.input.date).sort();
    return {imported,duplicates:rows.length-imported,period:{start:dates[0],end:dates[dates.length-1]}};
  });
}
