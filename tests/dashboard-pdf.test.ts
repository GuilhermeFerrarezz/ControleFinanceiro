import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardPdf } from '../src/lib/dashboard-pdf';
import { pdfFixture } from './pdf-fixture';

test('PDF pagina todos os valores diários, mensais e anuais sem páginas extras',async()=>{
  for(const [start,end,interval,pages] of [
    ['2026-01-01','2026-01-17','day',2],
    ['2026-01-01','2026-01-18','day',3],
    ['2026-01-01','2026-03-31','day',7],
    ['2026-01-01','2026-12-31','month',2],
    ['2000-01-01','2100-12-31','year',7],
  ] as const) {
    const data=pdfFixture(start,end);
    assert.equal(data.seriesInterval,interval);
    assert.equal(data.series.reduce((sum,row)=>sum+row.totalCents,0),data.summary.totalCents);
    const bytes=Buffer.from(await dashboardPdf(data,'Restaurante de teste','Responsável'));
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,pages);
  }
});
test('PDF sem gastos mantém os dias com total zero',async()=>{
  const data=pdfFixture('2026-01-01','2026-01-18',true);
  assert.equal(data.series.length,18);
  const bytes=Buffer.from(await dashboardPdf(data,'Restaurante','Responsável'));
  assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,3);
});
