import { buildExpenseSeries, daysBetween, type ExpenseDashboardData } from '../src/lib/expense-shared';

export function pdfFixture(start:string,end:string,empty=false):ExpenseDashboardData {
  const daily=empty?[]:[{date:start,totalCents:12345},{date:end,totalCents:98765}];
  const totalCents=daily.reduce((sum,row)=>sum+row.totalCents,0);
  return {
    filters:{start,end,category:'alimentos',status:'paid',q:'Mercado',page:1},
    expenses:[],count:daily.length,pages:1,pageSize:15,years:[],
    summary:{totalCents,paidCents:totalCents,pendingCents:0,count:daily.length,averageDailyCents:Math.round(totalCents/daysBetween(start,end)),previousTotalCents:0,changePercent:null},
    categories:empty?[]:[{category:'alimentos',totalCents,count:daily.length}],
    ...buildExpenseSeries(daily,start,end),availablePeriod:null,
  };
}
