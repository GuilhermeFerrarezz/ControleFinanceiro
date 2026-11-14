import { aggregateIngredientItems, excelPrice, excelQuantity, ingredientPrice, normalizeIngredient } from './ingredient-analysis';
import { excelMoney, subtractCents, sumCents } from './financial-math';
import ExcelJS from 'exceljs';
import { CSV_HEADERS } from './expense-csv';
import { categoryInfo,displayDate,EXPENSE_CATEGORIES,PAYMENT_METHODS,type CategoryOption,type ExpenseFilters,type DailyRevenue } from './expense-shared';
import type { IExpense } from '../models/Expense';
import { InputError } from './validation';
export async function expenseWorkbook(rows:IExpense[],filters:ExpenseFilters,restaurant:string,categories:readonly CategoryOption[]=EXPENSE_CATEGORIES, financial?:{expenses:DailyRevenue[];revenue:DailyRevenue[]}) {
  const itemCount = rows.reduce((count, row) => count + (row.items?.length ?? 0), 0);
  const financialDays = new Set([...(financial?.expenses ?? []), ...(financial?.revenue ?? [])].map(row => row.date)).size;
  if (rows.length * 11 + itemCount * 18 + financialDays * 8 > 250000 || Buffer.byteLength(JSON.stringify(rows), 'utf8') > 16 * 1024 * 1024) {
    throw new InputError('O Excel está muito grande. Reduza o período ou use CSV em partes (ZIP).');
  }
  const book=new ExcelJS.Workbook();book.creator='Saldo da Casa';book.created=new Date();
  const sheet=book.addWorksheet('Lançamentos',{views:[{state:'frozen',ySplit:1}]});
  const widths=[17,40,19,25,35,17,25,30,60,40,80];
  sheet.columns=CSV_HEADERS.map((header,index)=>({header,width:widths[index]}));
  // A plain styled range needs only one filter, including exports with no data.
  sheet.addRows(rows.map(row=>[new Date(`${row.date}T00:00:00Z`),row.description,excelMoney(row.amountCents),row.categoryLabel || categoryInfo(row.category,categories).label,row.merchant,row.status==='paid'?'Pago':'A pagar',PAYMENT_METHODS.find(item=>item.id===row.paymentMethod)!.label,row.authorName,row.notes,row.id,JSON.stringify(row.items || [])]));
  sheet.getColumn(10).hidden=true;sheet.getColumn(11).hidden=true;
  sheet.getColumn(1).numFmt='dd/mm/yyyy';sheet.getColumn(3).numFmt='"R$" #,##0.00';
  sheet.eachRow((row,index)=>{row.height=index===1?30:28;row.font={name:'Calibri',size:11};row.alignment={vertical:'middle',wrapText:true};if(index===1){row.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};}});
  sheet.eachRow((row,index)=>row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index===1?'FF254E3B':index%2===0?'FFF0F5ED':'FFFFFFFF'}};}));
  sheet.autoFilter={from:'A1',to:`K${rows.length+1}`};
  const products = book.addWorksheet('Produtos');
  products.columns = [{ header: 'Data', width: 18 }, { header: 'Compra', width: 35 }, { header: 'Local', width: 30 }, { header: 'Produto', width: 35 }, { header: 'Quantidade', width: 18 }, { header: 'Unidade', width: 15 }, { header: 'Valor total do item (R$)', width: 27 }, { header: 'Conteúdo por embalagem', width: 24 }, { header: 'Unidade do conteúdo', width: 20 }, { header: 'Quantidade convertida', width: 24 }, { header: 'Medida comparável', width: 20 }, { header: 'Preço por medida (R$)', width: 26 }];
  for (const row of rows) for (const item of row.items || []) {
    const normalized = normalizeIngredient(item);
    products.addRow([displayDate(row.date), row.description, row.merchant, item.name, item.quantity, item.unit, excelMoney(item.amountCents), item.packageContent?.quantity ?? null, item.packageContent?.unit ?? null, excelQuantity(normalized.quantity), normalized.unit, excelPrice(ingredientPrice(item.amountCents, normalized.quantity)!)]);
  }
  products.getColumn(7).numFmt = '"R$" #,##0.00';
  products.getRow(1).font = { bold: true, color: { argb: 'FF254E3B' } };
  products.getColumn(12).numFmt = '"R$" #,##0.00';
  const ingredients = book.addWorksheet('Insumos');
  ingredients.columns = [{ header: 'Insumo', width: 35 }, { header: 'Quantidade total', width: 24 }, { header: 'Medida', width: 18 }, { header: 'Valor gasto (R$)', width: 26 }, { header: 'Preço médio ponderado (R$)', width: 32 }];
  for (const item of aggregateIngredientItems(rows.flatMap(row => row.items || []))) ingredients.addRow([item.name, excelQuantity(item.quantity), item.unit, excelMoney(item.amountCents), excelPrice(item.priceCents)]);
  ingredients.getColumn(4).numFmt = ingredients.getColumn(5).numFmt = '"R$" #,##0.00';
  ingredients.getRow(1).font = { bold: true, color: { argb: 'FF254E3B' } };
  const summary=book.addWorksheet('Resumo');summary.columns=[{width:32},{width:65}];
  summary.addRows([['Saldo da Casa','Resumo da exportação'],['Restaurante',restaurant],['Período',`${displayDate(filters.start)} a ${displayDate(filters.end)}`],['Categoria',filters.category ? categoryInfo(filters.category,categories).label : 'Todas'],['Situação',filters.status==='paid'?'Pagos':filters.status==='pending'?'A pagar':'Todas'],['Busca',filters.q||'Sem busca'],['Lançamentos',rows.length],['Total (R$)',excelMoney(sumCents(rows.map(row=>row.amountCents)))],['Já pago (R$)',excelMoney(sumCents(rows.filter(row=>row.status==='paid').map(row=>row.amountCents)))],['A pagar (R$)',excelMoney(sumCents(rows.filter(row=>row.status==='pending').map(row=>row.amountCents)))],['Autoria','Cada gasto mantém a identificação de quem o registrou.']]);
  summary.getRow(1).font={bold:true,size:15,color:{argb:'FF254E3B'}};
  for(const n of [8,9,10])summary.getCell(`B${n}`).numFmt='"R$" #,##0.00';
  summary.eachRow(row=>{row.height=28;row.alignment={vertical:'middle',wrapText:true};});
  if (financial) {
    const revenue = new Map(financial.revenue.map(row => [row.date, row.totalCents]));
    const costs = new Map(financial.expenses.map(row => [row.date, row.totalCents]));
    const revenueDetails = new Map(financial.revenue.map(row => [row.date, row]));
    const days = [...new Set([...revenue.keys(), ...costs.keys()])].sort();
    const financialSheet = book.addWorksheet('Faturamento', { views: [{ state: 'frozen', ySplit: 1 }] });
    financialSheet.columns = [
      { header: 'Data', width: 20 }, { header: 'Faturamento (R$)', width: 23 },
      { header: 'Todos os gastos (R$)', width: 25 }, { header: 'Resultado (R$)', width: 23 },
      { header: 'Refeições/marmitex vendidos', width: 30 }, { header: 'Número de pedidos', width: 23 },
      { header: 'Marmitex delivery', width: 23 }, { header: 'Refeições no restaurante', width: 28 },
    ];
    financialSheet.addRows(days.map(date => {
      const sales = revenue.get(date);
      const expenses = costs.get(date) ?? 0;
      return [new Date(`${date}T00:00:00Z`), sales === undefined ? null : excelMoney(sales),
        excelMoney(expenses), sales === undefined ? null : excelMoney(subtractCents(sales, expenses)), revenueDetails.get(date)?.mealsSold ?? null, revenueDetails.get(date)?.orderCount ?? null, revenueDetails.get(date)?.deliveryMeals ?? null, revenueDetails.get(date)?.dineInMeals ?? null];
    }));
    financialSheet.getColumn(1).numFmt = 'dd/mm/yyyy';
    for (const column of [2, 3, 4]) financialSheet.getColumn(column).numFmt = '"R$" #,##0.00';
    financialSheet.getRow(1).font = { bold: true, color: { argb: 'FF254E3B' } };
    financialSheet.autoFilter = { from: 'A1', to: `H${days.length + 1}` };
    const revenueTotal = sumCents(financial.revenue.map(row => row.totalCents));
    const costsTotal = sumCents(financial.expenses.map(row => row.totalCents));
    for (const [label, amount] of [
      ['Faturamento informado', revenue.size ? revenueTotal : null],
      ['Gastos do restaurante', costsTotal],
      ['Resultado informado', revenue.size ? subtractCents(revenueTotal, costsTotal) : null],
    ] as const) {
      summary.addRow([label, amount === null ? 'Sem registro' : excelMoney(amount)]).getCell(2).numFmt = '"R$" #,##0.00';
    }
    summary.addRow(['Dias com faturamento', revenue.size]);
    summary.addRow(['Resultado', 'Inclui todos os gastos do período. Pode ser parcial se faltar faturamento.']);
  }
  summary.addRow(['Local', filters.merchant || 'Todos']);
  summary.addRow(['Precisão', 'Valores com mais de 15 algarismos em centavos são exportados como texto para preservar os centavos.']);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
