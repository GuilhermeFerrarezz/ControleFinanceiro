import ExcelJS from 'exceljs';
import { CSV_HEADERS } from './expense-csv';
import { displayDate,EXPENSE_CATEGORIES,PAYMENT_METHODS,type ExpenseFilters } from './expense-shared';
import type { IExpense } from '../models/Expense';
export async function expenseWorkbook(rows:IExpense[],filters:ExpenseFilters,restaurant:string) {
  const book=new ExcelJS.Workbook();book.creator='Saldo da Casa';book.created=new Date();
  const sheet=book.addWorksheet('Lançamentos',{views:[{state:'frozen',ySplit:1}]});
  const widths=[17,40,19,25,35,17,25,30,60,40];
  sheet.columns=CSV_HEADERS.map((header,index)=>({header,width:widths[index]}));
  // A plain styled range needs only one filter, including exports with no data.
  sheet.addRows(rows.map(row=>[new Date(`${row.date}T00:00:00Z`),row.description,row.amountCents/100,EXPENSE_CATEGORIES.find(item=>item.id===row.category)!.label,row.merchant,row.status==='paid'?'Pago':'A pagar',PAYMENT_METHODS.find(item=>item.id===row.paymentMethod)!.label,row.authorName,row.notes,row.id]));
  sheet.getColumn(10).hidden=true;
  sheet.getColumn(1).numFmt='dd/mm/yyyy';sheet.getColumn(3).numFmt='"R$" #,##0.00';
  sheet.eachRow((row,index)=>{row.height=index===1?30:28;row.font={name:'Calibri',size:11};row.alignment={vertical:'middle',wrapText:true};if(index===1){row.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};}});
  sheet.eachRow((row,index)=>row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index===1?'FF254E3B':index%2===0?'FFF0F5ED':'FFFFFFFF'}};}));
  sheet.autoFilter={from:'A1',to:`J${rows.length+1}`};
  const summary=book.addWorksheet('Resumo');summary.columns=[{width:32},{width:65}];
  summary.addRows([['Saldo da Casa','Resumo da exportação'],['Restaurante',restaurant],['Período',`${displayDate(filters.start)} a ${displayDate(filters.end)}`],['Categoria',EXPENSE_CATEGORIES.find(item=>item.id===filters.category)?.label||'Todas'],['Situação',filters.status==='paid'?'Pagos':filters.status==='pending'?'A pagar':'Todas'],['Busca',filters.q||'Sem busca'],['Lançamentos',rows.length],['Total (R$)',rows.reduce((sum,row)=>sum+row.amountCents,0)/100],['Já pago (R$)',rows.filter(row=>row.status==='paid').reduce((sum,row)=>sum+row.amountCents,0)/100],['A pagar (R$)',rows.filter(row=>row.status==='pending').reduce((sum,row)=>sum+row.amountCents,0)/100],['Autoria','Cada gasto mantém a identificação de quem o registrou.']]);
  summary.getRow(1).font={bold:true,size:15,color:{argb:'FF254E3B'}};
  for(const n of [8,9,10])summary.getCell(`B${n}`).numFmt='"R$" #,##0.00';
  summary.eachRow(row=>{row.height=28;row.alignment={vertical:'middle',wrapText:true};});
  return new Uint8Array(await book.xlsx.writeBuffer());
}
