'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import { addDays, categoryInfo, displayDate, EXPENSE_CATEGORIES, money, monthPeriod, yearPeriod, selectedPeriodYear, todayInSaoPaulo, type ExpenseDashboardData, type ExpenseFilters, type ExpenseRecord } from '@/src/lib/expense-shared';
import RestaurantSwitcher from '@/src/app/(system)/dashboard/RestaurantSwitcher';
import ExpenseCharts from './ExpenseCharts';
import DemoDataControls from './DemoDataControls';
import ExpenseForm from './ExpenseForm';
import ImportExpenses from './ImportExpenses';
import DeleteExpensePeriod from './DeleteExpensePeriod';
import { downloadBlob } from '@/src/lib/browser-download';
import Icon from './Icon';
import styles from './finance.module.css';

function filterParams(filters: ExpenseFilters) {
  return new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
}
export default function FinancialDashboard({ initialData, view, user, restaurants, selectedRestaurant, initialNotice, demoEnabled }: {
  initialData: ExpenseDashboardData; view: 'overview' | 'expenses'; user: { id: string; nome: string; role?: string };
  restaurants: { id: string; nome: string }[]; selectedRestaurant: string; initialNotice: string; demoEnabled: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [draft, setDraft] = useState(initialData.filters);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ExpenseRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [pdfBusy,setPdfBusy] = useState(false);
  const [importing,setImporting] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (deleting) deleteDialog.current?.showModal(); else deleteDialog.current?.close(); }, [deleting]);

  async function load(filters = data.filters) {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try {
      const response = await api.get<ExpenseDashboardData>(`/expenses?${filterParams(filters)}`, { signal: request.signal });
      if (!request.signal.aborted) { setData(response.data); setDraft(response.data.filters); }
    } catch (error) { if (!request.signal.aborted) setError(errorMessage(error)); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }
  function apply(event: FormEvent) { event.preventDefault(); setNotice(''); void load({ ...draft, page: 1 }); }
  async function saved(another: boolean) {
    if (!another) setForm(null);
    setNotice('Gasto salvo. O resumo considera os filtros e o período selecionados.');
    await load();
  }
  async function remove() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true); setError('');
    try { await api.delete(`/expenses/${deleting.id}`, { data: { version: deleting.version } }); setDeleting(null); setNotice('Gasto excluído. Os totais foram atualizados.'); await load(); }
    catch (error) { setError(errorMessage(error)); setDeleting(null); }
    finally { setDeleteBusy(false); }
  }
  function preset(value: string) {
    const today = todayInSaoPaulo();
    let period = monthPeriod(today);
    if (value === 'all') period = data.availablePeriod || monthPeriod(today);
    if (value === 'week') period = { start: addDays(today, -6), end: today };
    if (value === 'previous') { const end = addDays(`${today.slice(0, 7)}-01`, -1); period = { start: `${end.slice(0, 7)}-01`, end }; }
    const filters = { ...draft, ...period, page: 1 };
    setDraft(filters); setNotice(''); void load(filters);
  }
  async function download(format:'csv'|'xlsx'='csv') {
    setExportBusy(true); setError('');
    try {
      const params = filterParams(data.filters); params.set('format', format);
      const response = await api.get(`/expenses?${params}`, { responseType: 'blob', timeout:60000 });
      downloadBlob(response.data,`gastos-${data.filters.start}-${data.filters.end}.${format}`);
    } catch { setError('Não foi possível exportar os gastos. Tente reduzir o período ou aplicar mais filtros.'); }
    finally { setExportBusy(false); }
  }
  async function report() {
    setPdfBusy(true);setError('');
    try{const response=await api.get(`/expenses/report?${filterParams(data.filters)}`,{responseType:'blob',timeout:60000});downloadBlob(response.data,`resumo-${data.filters.start}-${data.filters.end}.pdf`);}
    catch{setError('Não foi possível gerar o PDF. Tente novamente.');}finally{setPdfBusy(false);}
  }
  const summary = data.summary;
  const categoryOptions = data.categoryOptions || EXPENSE_CATEGORIES;
  const rows = view === 'overview' ? data.expenses.slice(0, 5) : data.expenses;
  const hasFilters = !!(data.filters.category || data.filters.status || data.filters.q);
  return <>
    <div className={styles.heading}><div><span className="eyebrow">{view === 'overview' ? 'Um olhar atento para o seu negócio' : 'A rotina da casa, organizada'}</span><h1>{view === 'overview' ? 'Cada gasto, mais clareza.' : 'Todos os gastos, em um lugar.'}</h1><p>{view === 'overview' ? `Olá, ${user.nome.split(' ')[0]}. Acompanhe os custos e cuide dos próximos passos.` : 'Registre, encontre e acompanhe os lançamentos do seu restaurante.'}</p></div><div className={styles.headingActions}><RestaurantSwitcher restaurants={restaurants} selected={selectedRestaurant} /><button className="button button-outline" disabled={pdfBusy||loading} onClick={report}><Icon name="download" size={17}/>{pdfBusy?'Gerando PDF...':'Gerar PDF'}</button><button className="button" onClick={() => { setNotice(''); setForm('new'); }}><Icon name="plus" size={19} />Novo gasto</button></div></div>
    {notice && <div className={styles.notice} role="status"><Icon name="check" size={18} /><span>{notice}</span><button aria-label="Fechar mensagem" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
    {error && <div className={styles.error} role="alert">{error} <button className={styles.textButton} onClick={() => void load()}>Atualizar lista</button></div>}
    {demoEnabled && <DemoDataControls count={data.demoCount} onChanged={async action => {
      setNotice(action === 'restore' ? 'Exemplos restaurados. Mostrando o mês atual.' : 'Exemplos excluídos. Seus gastos reais foram preservados.');
      await load(action === 'restore' ? { ...data.filters,...monthPeriod(),category:'',status:'',q:'',page:1 } : data.filters);
    }} />}
    <section className={styles.filtersCard} aria-label="Filtros do período"><form onSubmit={apply} className={styles.filters}>
      <div className={styles.periodShortcuts}><span>Ver período</span><div><button type="button" onClick={() => preset('all')}>Todo o período</button><button type="button" onClick={() => preset('month')}>Mês atual</button><button type="button" onClick={() => preset('previous')}>Mês anterior</button><button type="button" onClick={() => preset('week')}>Últimos 7 dias</button></div></div>
      <label className={styles.filterField} htmlFor="filter-year">Ano<select id="filter-year" value={selectedPeriodYear(draft)} disabled={loading} onChange={event=>{
        if(!event.target.value) return;
        const filters={...draft,...yearPeriod(Number(event.target.value)),page:1};
        setDraft(filters);setNotice('');void load(filters);
      }}><option value="">Período personalizado</option>{Array.from(new Set([...data.years,Number(draft.start.slice(0,4))])).sort((a,b)=>b-a).map(year=><option key={year} value={year}>{year}</option>)}</select></label>
      <label className={styles.filterField} htmlFor="filter-start">De<input id="filter-start" type="date" min="2000-01-01" max="2100-12-31" required value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label>
      <label className={styles.filterField} htmlFor="filter-end">Até<input id="filter-end" type="date" min="2000-01-01" max="2100-12-31" required value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label>
      <label className={styles.filterField} htmlFor="filter-category">Categoria<select id="filter-category" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}><option value="">Todas as categorias</option>{categoryOptions.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      <label className={styles.filterField} htmlFor="filter-status">Situação<select id="filter-status" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="">Todos os gastos</option><option value="paid">Pagos</option><option value="pending">A pagar</option></select></label>
      <button className="button" type="submit" disabled={loading}>{loading ? 'Atualizando...' : 'Aplicar filtros'}</button>
      <label className={`${styles.filterField} ${styles.searchField}`} htmlFor="filter-search">Buscar descrição ou local<input id="filter-search" type="search" placeholder="Ex.: hortifruti, mercado, diária..." maxLength={120} value={draft.q} onChange={event => setDraft({ ...draft, q: event.target.value })} /></label>
    </form></section>
    <div className={styles.periodLine}><span>{displayDate(data.filters.start)} a {displayDate(data.filters.end)}{hasFilters ? ' · Com filtros aplicados' : ''}</span>{hasFilters && <button className={styles.textButton} onClick={() => void load({ ...data.filters, category: '', status: '', q: '', page: 1 })}>Limpar filtros</button>}<span>{loading ? 'Atualizando os dados...' : `${data.count} ${data.count === 1 ? 'lançamento encontrado' : 'lançamentos encontrados'}`}</span></div>
    {view === 'expenses' && user.role === 'owner' && <DeleteExpensePeriod
      empresaId={selectedRestaurant} restaurantName={restaurants.find(restaurant => restaurant.id === selectedRestaurant)?.nome || 'Restaurante ativo'}
      start={data.filters.start} end={data.filters.end} disabled={loading}
      onDeleted={async count => {
        setNotice(count ? `${count} ${count === 1 ? 'lançamento excluído' : 'lançamentos excluídos'}. Os totais foram atualizados.` : 'Nenhum lançamento encontrado no período para excluir.');
        await load({ ...data.filters, page: 1 });
      }}
    />}
    <div aria-busy={loading} className={loading ? styles.refreshing : undefined}>
      <section className={styles.stats} aria-label="Resumo dos gastos">
        <article className={`${styles.stat} ${styles.totalStat}`}><span><Icon name="receipt" size={18} />Total do período</span><strong>{money(summary.totalCents)}</strong><small>{summary.changePercent === null ? 'Sem base no período anterior' : `${Math.abs(summary.changePercent).toLocaleString('pt-BR')}% ${summary.changePercent > 0 ? 'a mais' : summary.changePercent < 0 ? 'a menos' : 'de variação'} em relação ao período anterior equivalente`}</small></article>
        <article className={styles.stat}><span><i className={styles.paidDot} />Já pago</span><strong>{money(summary.paidCents)}</strong><small>Pagamentos concluídos</small></article>
        <article className={styles.stat}><span><i className={styles.pendingDot} />A pagar</span><strong>{money(summary.pendingCents)}</strong><small>Gastos ainda não pagos</small></article>
        <article className={styles.stat}><span><Icon name="chart" size={18} />Média por dia</span><strong>{money(summary.averageDailyCents)}</strong><small>Considera todos os dias do período</small></article>
      </section>
      {view === 'overview' && <ExpenseCharts key={`${data.filters.start}-${data.filters.end}`} data={data} />}
      <section className={styles.listCard} aria-labelledby="expense-list-title"><div className={styles.listHeading}><div><h2 id="expense-list-title">{view === 'overview' ? 'Últimos lançamentos' : 'Lançamentos do período'}</h2><p>{view === 'overview' ? 'Os registros mais recentes da sua equipe.' : user.role === 'owner' ? 'Você pode administrar todos os gastos deste restaurante.' : 'Você pode editar e excluir os gastos que lançou.'}</p></div><div className={styles.listActions}><button className={styles.textButton} onClick={()=>setImporting(true)}>Importar CSV</button><button className={styles.textButton} onClick={()=>void download('xlsx')} disabled={exportBusy||data.count===0}>Excel formatado <Icon name="download" size={16}/></button><button className={styles.textButton} onClick={()=>void download('csv')} disabled={exportBusy || data.count === 0}>{exportBusy ? 'Exportando...' : 'Exportar CSV'} <Icon name="download" size={16} /></button>{view === 'overview' && <Link href={`/dashboard/expenses?${filterParams({ ...data.filters, page: 1 })}`} className={styles.textButton}>Ver todos <Icon name="arrow" size={16} /></Link>}</div></div>
        {rows.length === 0 ? <div className={styles.empty}><span><Icon name="receipt" size={36} /></span><h3>{hasFilters ? 'Nenhum gasto com esses filtros.' : 'Tudo começa com o primeiro registro.'}</h3><p>{hasFilters ? 'Tente outra categoria, situação ou termo de busca.' : 'Registre um gasto para começar a enxergar os números da sua casa.'}</p><button className="button" onClick={() => setForm('new')}><Icon name="plus" size={17} />Lançar um gasto</button></div> : <>
          <div className={styles.tableWrap}><table className={styles.expenseTable}><caption className={styles.srOnly}>Gastos do restaurante no período selecionado</caption><thead><tr><th>Gasto</th><th>Categoria</th><th>Data</th><th>Situação</th><th>Valor</th><th><span className={styles.srOnly}>Ações</span></th></tr></thead><tbody>{rows.map(expense => {
            const category = categoryInfo(expense.category, categoryOptions);
            return <tr key={expense.id}><td data-label="Gasto"><strong>{expense.description}</strong><span>{expense.merchant || 'Local não informado'}</span><small className={styles.authorship}>Lançado por <b>{expense.authorName}</b></small>{expense.isDemo && <span className={styles.demoBadge}>Exemplo</span>}{expense.notes && <details className={styles.rowNotes}><summary>Observações</summary><p>{expense.notes}</p></details>}</td><td data-label="Categoria"><span className={styles.categoryChip}><i style={{ background: category.color }} />{category.label}</span></td><td data-label="Data">{displayDate(expense.date)}</td><td data-label="Situação"><span className={expense.status === 'paid' ? styles.paid : styles.pending}>{expense.status === 'paid' ? 'Pago' : 'A pagar'}</span></td><td data-label="Valor" className={styles.amount}>{money(expense.amountCents)}</td><td data-label="Ações"><div className={styles.rowActions}>{expense.canManage ? <><button className={styles.iconButton} aria-label={`Editar ${expense.description}`} onClick={() => { setError(''); setForm(expense); }}><Icon name="edit" size={18} /></button><button className={styles.iconButton} aria-label={`Excluir ${expense.description}`} onClick={() => setDeleting(expense)}><Icon name="trash" size={18} /></button></> : <span className={styles.readOnly}>Somente leitura</span>}</div></td></tr>;
          })}</tbody></table></div>
          {view === 'expenses' && <div className={styles.pagination}><span>{(data.filters.page - 1) * data.pageSize + 1}–{Math.min(data.filters.page * data.pageSize, data.count)} de {data.count} gastos</span><div><button onClick={() => void load({ ...data.filters, page: data.filters.page - 1 })} disabled={loading || data.filters.page === 1}>Anterior</button><span>{data.filters.page} / {data.pages}</span><button onClick={() => void load({ ...data.filters, page: data.filters.page + 1 })} disabled={loading || data.filters.page >= data.pages}>Próxima</button></div></div>}
        </>}
      </section>
    </div>
    <p className={styles.bottomNote}><Icon name="shield" size={15} />Os dados pertencem ao restaurante ativo. Donos administram todos os lançamentos; funcionários, os próprios.</p>
    {importing && <ImportExpenses empresaId={selectedRestaurant} onClose={()=>setImporting(false)} onImported={async result=>{
      setImporting(false);setNotice(`${result.imported} lançamentos importados. ${result.duplicates} repetidos foram ignorados.`);
      await load({...data.filters,...result.period,category:'',status:'',q:'',page:1});
    }}/>}
    {form && <ExpenseForm expense={form === 'new' ? undefined : form} empresaId={selectedRestaurant} categoryOptions={categoryOptions} onClose={() => setForm(null)} onSaved={saved} />}
    <dialog ref={deleteDialog} className={`${styles.dialog} ${styles.confirmDialog}`} aria-labelledby="delete-title" onCancel={event => { event.preventDefault(); if (!deleteBusy) setDeleting(null); }}><div className={styles.dialogInner}><span className={styles.deleteIcon}><Icon name="trash" size={27} /></span><h2 id="delete-title">Excluir este gasto?</h2><p>“{deleting?.description}” será removido da lista e dos gráficos. O histórico da operação será preservado.</p><div className={styles.formActions}><button className="button button-outline" disabled={deleteBusy} onClick={() => setDeleting(null)}>Manter gasto</button><button className={styles.dangerButton} disabled={deleteBusy} onClick={remove}>{deleteBusy ? 'Excluindo...' : 'Excluir gasto'}</button></div></div></dialog>
  </>;
}
