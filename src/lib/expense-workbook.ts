import ExcelJS from 'exceljs';
import { CSV_HEADERS } from './expense-csv';
import { categoryInfo,displayDate,EXPENSE_CATEGORIES,PAYMENT_METHODS,type CategoryOption,type ExpenseFilters,type DailyRevenue } from './expense-shared';
import type { IExpense } from '../models/Expense';
export async function expenseWorkbook(rows:IExpense[],filters:ExpenseFilters,restaurant:string,categories:readonly CategoryOption[]=EXPENSE_CATEGORIES, financial?:{expenses:DailyRevenue[];revenue:DailyRevenue[]}) {
  const book=new ExcelJS.Workbook();book.creator='Saldo da Casa';book.created=new Date();
  const sheet=book.addWorksheet('Lançamentos',{views:[{state:'frozen',ySplit:1}]});
  const widths=[17,40,19,25,35,17,25,30,60,40];
  sheet.columns=CSV_HEADERS.map((header,index)=>({header,width:widths[index]}));
  // A plain styled range needs only one filter, including exports with no data.
  sheet.addRows(rows.map(row=>[new Date(`${row.date}T00:00:00Z`),row.description,row.amountCents/100,row.categoryLabel || categoryInfo(row.category,categories).label,row.merchant,row.status==='paid'?'Pago':'A pagar',PAYMENT_METHODS.find(item=>item.id===row.paymentMethod)!.label,row.authorName,row.notes,row.id]));
  sheet.getColumn(10).hidden=true;
  sheet.getColumn(1).numFmt='dd/mm/yyyy';sheet.getColumn(3).numFmt='"R$" #,##0.00';
  sheet.eachRow((row,index)=>{row.height=index===1?30:28;row.font={name:'Calibri',size:11};row.alignment={vertical:'middle',wrapText:true};if(index===1){row.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};}});
  sheet.eachRow((row,index)=>row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index===1?'FF254E3B':index%2===0?'FFF0F5ED':'FFFFFFFF'}};}));
  sheet.autoFilter={from:'A1',to:`J${rows.length+1}`};
  const summary=book.addWorksheet('Resumo');summary.columns=[{width:32},{width:65}];
  summary.addRows([['Saldo da Casa','Resumo da exportação'],['Restaurante',restaurant],['Período',`${displayDate(filters.start)} a ${displayDate(filters.end)}`],['Categoria',filters.category ? categoryInfo(filters.category,categories).label : 'Todas'],['Situação',filters.status==='paid'?'Pagos':filters.status==='pending'?'A pagar':'Todas'],['Busca',filters.q||'Sem busca'],['Lançamentos',rows.length],['Total (R$)',rows.reduce((sum,row)=>sum+row.amountCents,0)/100],['Já pago (R$)',rows.filter(row=>row.status==='paid').reduce((sum,row)=>sum+row.amountCents,0)/100],['A pagar (R$)',rows.filter(row=>row.status==='pending').reduce((sum,row)=>sum+row.amountCents,0)/100],['Autoria','Cada gasto mantém a identificação de quem o registrou.']]);
  summary.getRow(1).font={bold:true,size:15,color:{argb:'FF254E3B'}};
  for(const n of [8,9,10])summary.getCell(`B${n}`).numFmt='"R$" #,##0.00';
  summary.eachRow(row=>{row.height=28;row.alignment={vertical:'middle',wrapText:true};});
  if (financial) {
    const revenue = new Map(financial.revenue.map(row => [row.date, row.totalCents]));
    const costs = new Map(financial.expenses.map(row => [row.date, row.totalCents]));
    const days = [...new Set([...revenue.keys(), ...costs.keys()])].sort();
    const financialSheet = book.addWorksheet('Faturamento', { views: [{ state: 'frozen', ySplit: 1 }] });
    financialSheet.columns = [
      { header: 'Data', width: 20 }, { header: 'Faturamento (R$)', width: 23 },
      { header: 'Todos os gastos (R$)', width: 25 }, { header: 'Resultado (R$)', width: 23 },
    ];
    financialSheet.addRows(days.map(date => {
      const sales = revenue.get(date);
      const expenses = costs.get(date) ?? 0;
      return [new Date(`${date}T00:00:00Z`), sales === undefined ? null : sales / 100,
        expenses / 100, sales === undefined ? null : (sales - expenses) / 100];
    }));
    financialSheet.getColumn(1).numFmt = 'dd/mm/yyyy';
    for (const column of [2, 3, 4]) financialSheet.getColumn(column).numFmt = '"R$" #,##0.00';
    financialSheet.getRow(1).font = { bold: true, color: { argb: 'FF254E3B' } };
    financialSheet.autoFilter = { from: 'A1', to: `D${days.length + 1}` };
    const revenueTotal = financial.revenue.reduce((sum, row) => sum + row.totalCents, 0);
    const costsTotal = financial.expenses.reduce((sum, row) => sum + row.totalCents, 0);
    for (const [label, amount] of [
      ['Faturamento informado', revenue.size ? revenueTotal : null],
      ['Gastos do restaurante', costsTotal],
      ['Resultado informado', revenue.size ? revenueTotal - costsTotal : null],
    ] as const) {
      summary.addRow([label, amount === null ? 'Sem registro' : amount / 100]).getCell(2).numFmt = '"R$" #,##0.00';
    }
    summary.addRow(['Dias com faturamento', revenue.size]);
    summary.addRow(['Resultado', 'Inclui todos os gastos do período. Pode ser parcial se faltar faturamento.']);
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
