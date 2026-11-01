import PDFDocument from 'pdfkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { displayDate,daysBetween,EXPENSE_CATEGORIES,money,trendPeriodLabel,type ExpenseDashboardData } from './expense-shared';

let fonts:Promise<Buffer[]>|undefined;
const loadFonts=()=>fonts??=Promise.all(['NotoSans-Regular.ttf','NotoSans-Bold.ttf'].map(name=>readFile(join(process.cwd(),'public','fonts',name))));
export async function dashboardPdf(data:ExpenseDashboardData,restaurant:string,author:string) {
  const [regular,bold]=await loadFonts();
  const doc=new PDFDocument({size:'A4',layout:'landscape',margin:0,bufferPages:true,info:{Title:'Resumo financeiro do restaurante',Author:'Controle Financeiro',Subject:`${displayDate(data.filters.start)} a ${displayDate(data.filters.end)}`}});
  doc.registerFont('Report',regular);doc.registerFont('ReportBold',bold);doc.font('Report');
  const chunks:Buffer[]=[];
  const output=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(Buffer.from(chunk)));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const ink='#203d31',muted='#76816c',green='#254e3b',paper='#f8f7f2';
  const text=(value:string,x:number,y:number,width:number,size=10,color=ink,strong=false,height=20)=>{doc.font(strong?'ReportBold':'Report').fontSize(size).fillColor(color).text(value.replace(/[\r\n\t]+/g,' '),x,y,{width,height,ellipsis:true,lineGap:1});};
  const fit=(value:string,width:number,size:number)=>{doc.font('ReportBold').fontSize(size);while(size>9&&doc.widthOfString(value)>width){size--;doc.fontSize(size);}return size;};
  doc.rect(0,0,842,595).fill(paper);
  text('CONTROLE FINANCEIRO',36,23,420,11,green,true);
  text('RESUMO DO PERÍODO',540,23,266,9,muted,true);
  text(restaurant,36,48,770,20,ink,true,52);
  text(`${displayDate(data.filters.start)} a ${displayDate(data.filters.end)}  |  ${data.count} lançamentos`,36,108,770,11,green,true);
  const category=EXPENSE_CATEGORIES.find(item=>item.id===data.filters.category)?.label||'Todas as categorias';
  const status=data.filters.status==='paid'?'Pagos':data.filters.status==='pending'?'A pagar':'Todas as situações';
  text(`Filtros: ${category}  |  ${status}${data.filters.q?`  |  Busca: ${data.filters.q}`:''}`,36,132,770,9,muted,false,30);
  const cards=[['Total do período',data.summary.totalCents],['Já pago',data.summary.paidCents],['A pagar',data.summary.pendingCents],['Média por dia',data.summary.averageDailyCents]] as const;
  cards.forEach(([label,value],index)=>{
    const x=36+index*196,selected=index===0;
    doc.roundedRect(x,174,182,68,8).fillAndStroke(selected?green:'#fffefa',selected?green:'#dfe4d5');
    text(label,x+12,184,158,9,selected?'#d3dfc0':muted);
    const formatted=money(value);text(formatted,x+12,205,158,fit(formatted,158,19),selected?'#ffffff':ink,true,27);
  });
  text('O ritmo dos gastos',36,263,460,13,ink,true);
  const interval=data.seriesInterval==='day'?'Diário':data.seriesInterval==='month'?'Mensal':'Anual';
  text(`${interval} - totais do período selecionado`,36,285,460,8,muted);
  const series=data.series,left=82,right=488,top=316,bottom=470,max=Math.max(...series.map(row=>row.totalCents),100);
  const x=(index:number)=>series.length===1?(left+right)/2:left+index/(series.length-1)*(right-left);
  const y=(value:number)=>bottom-value/max*(bottom-top);
  if(data.count) {
    for(const part of [0,.25,.5,.75,1]){
      doc.moveTo(left,y(max*part)).lineTo(right,y(max*part)).lineWidth(.6).strokeColor('#dfe4d5').stroke();
      text(new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(max*part/100),36,y(max*part)-5,38,7,muted);
    }
    const path=series.map((row,index)=>`${index?'L':'M'}${x(index)} ${y(row.totalCents)}`).join(' ');
    doc.path(`${path} L${x(series.length-1)} ${bottom} L${x(0)} ${bottom} Z`).fill('#e2ead7');
    doc.path(path).lineWidth(1.6).strokeColor('#42694d').stroke();
    if(series.length<=40)series.forEach((row,index)=>doc.circle(x(index),y(row.totalCents),2.8).fill('#42694d'));
    const indices=Array.from(new Set([0,Math.floor((series.length-1)/4),Math.floor((series.length-1)/2),Math.floor((series.length-1)*.75),series.length-1]));
    indices.forEach(index=>text(trendPeriodLabel(series[index].date,data.seriesInterval,true),x(index)-20,480,42,7,muted));
  }else text('Nenhum gasto encontrado com os filtros selecionados.',95,377,365,11,muted,false,40);
  const peak=data.peakDay;
  text('Maior gasto em um dia',36,518,220,8,muted);
  text(peak?`${money(peak.totalCents)} em ${displayDate(peak.date)}`:'Sem lançamentos',36,534,245,10,ink,true);
  text('Dias com gastos',300,518,200,8,muted);
  text(`${data.daysWithExpenses} de ${daysBetween(data.filters.start,data.filters.end)} dias`,300,534,200,10,ink,true);
  text('Para onde vai o dinheiro',526,263,280,13,ink,true);
  const cx=666,cy=351,radius=54,inner=36;
  if(data.count){
    let start=0;
    for(const row of data.categories){
      const fraction=row.totalCents/data.summary.totalCents,mid=start+fraction/2,end=start+fraction;
      const point=(r:number,part:number)=>`${cx+r*Math.cos((part*360-90)*Math.PI/180)} ${cy+r*Math.sin((part*360-90)*Math.PI/180)}`;
      const path=`M${point(radius,start)} A${radius} ${radius} 0 0 1 ${point(radius,mid)} A${radius} ${radius} 0 0 1 ${point(radius,end)} L${point(inner,end)} A${inner} ${inner} 0 0 0 ${point(inner,mid)} A${inner} ${inner} 0 0 0 ${point(inner,start)} Z`;
      doc.path(path).fill(EXPENSE_CATEGORIES.find(category=>category.id===row.category)!.color);start=end;
    }
    doc.font('ReportBold').fontSize(20).fillColor(ink).text(String(data.categories.length),cx-36,331,{width:72,height:28,align:'center'});
    doc.font('Report').fontSize(7).fillColor(muted).text('categorias',cx-36,361,{width:72,height:14,align:'center'});
  }else{doc.circle(cx,cy,radius).fill('#e4e9da');doc.circle(cx,cy,inner).fill(paper);text('Sem gastos',cx-35,344,80,9,muted);}
  text('Categoria',538,412,120,7,muted,true);text('Valor',668,412,92,7,muted,true);text('%',775,412,30,7,muted,true);
  data.categories.forEach((row,index)=>{
    const category=EXPENSE_CATEGORIES.find(item=>item.id===row.category)!,yy=431+index*14;
    doc.circle(530,yy+5,2.5).fill(category.color);
    text(category.label,538,yy,122,7.5,ink);
    const amount=money(row.totalCents);text(amount,668,yy,102,fit(amount,102,8),ink);
    text(new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(row.totalCents/data.summary.totalCents*100)+'%',777,yy,31,7,muted);
  });
  const detailTitle=data.seriesInterval==='day'?'Gastos por dia':data.seriesInterval==='month'?'Gastos por mês':'Gastos por ano';
  const periodTitle=data.seriesInterval==='day'?'Data':data.seriesInterval==='month'?'Mês':'Ano';
  const rowsPerPage=17;
  const detailPages=Math.max(1,Math.ceil(series.length/rowsPerPage));
  for(let page=0;page<detailPages;page++) {
    doc.addPage();
    doc.rect(0,0,842,595).fill(paper);
    text('CONTROLE FINANCEIRO',36,23,420,11,green,true);
    text('DETALHAMENTO DOS GASTOS',540,23,266,9,muted,true);
    text(detailTitle,36,51,770,20,ink,true,30);
    text(restaurant,36,87,770,11,ink,true);
    text(`${displayDate(data.filters.start)} a ${displayDate(data.filters.end)}  |  ${data.count} lançamentos`,36,108,770,11,green,true);
    text(`Filtros: ${category}  |  ${status}${data.filters.q?`  |  Busca: ${data.filters.q}`:''}`,36,132,770,9,muted,false,30);
    doc.rect(36,169,770,24).fill(green);
    text(periodTitle,48,174,550,9,'#ffffff',true);
    text('Total dos gastos',650,174,144,9,'#ffffff',true);
    const pageRows=series.slice(page*rowsPerPage,(page+1)*rowsPerPage);
    pageRows.forEach((row,index)=>{
      const yy=193+index*20;
      doc.rect(36,yy,770,20).fill(index%2===0?'#fffefa':'#edf1e7');
      text(trendPeriodLabel(row.date,data.seriesInterval),48,yy+4,570,9);
      doc.font('Report').fontSize(9).fillColor(ink).text(money(row.totalCents),650,yy+4,{width:144,height:16,align:'right'});
    });
    if(page===detailPages-1) {
      const yy=199+pageRows.length*20;
      text('Total do período',48,yy,550,10,green,true);
      doc.font('ReportBold').fontSize(10).fillColor(green).text(money(data.summary.totalCents),650,yy,{width:144,height:18,align:'right'});
    }
  }
  const generated=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date());
  const pages=doc.bufferedPageRange();
  for(let page=pages.start;page<pages.start+pages.count;page++) {
    doc.switchToPage(page);
    doc.moveTo(36,570).lineTo(806,570).lineWidth(.6).strokeColor('#dfe4d5').stroke();
    text(`Gerado em ${generated} - ${author}`,36,578,660,7,muted);
    text(`Página ${page+1} de ${pages.count}`,736,578,85,7,muted);
  }
  doc.end();return new Uint8Array(await output);
}
