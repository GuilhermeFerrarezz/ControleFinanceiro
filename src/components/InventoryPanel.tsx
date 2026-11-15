'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import { newExpenseRequestId, todayInSaoPaulo } from '@/src/lib/expense-shared';
import { stockUnit, STOCK_UNITS, type InventoryData, type InventoryProduct } from '@/src/lib/inventory-shared';
import { displayPrice, displayQuantity } from '@/src/lib/ingredient-analysis';
import type { ProductOption } from '@/src/lib/catalog-shared';
import styles from './inventory.module.css';

const sources: Record<string,string> = { purchase:'Compra recebida',opening:'Saldo inicial',entry:'Entrada avulsa',consumption:'Consumo',waste:'Perda',count:'Contagem física',correction:'Correção de saída' };
const day = (date: string) => date.split('-').reverse().join('/');
const qty = (value: string) => value.startsWith('-') ? '−'+displayQuantity(value.slice(1)) : displayQuantity(value);
const status = (product: InventoryProduct) => Number(product.balance) === 0 ? 'empty' : Number(product.balance) <= Number(product.minimum) ? 'low' : 'ok';
const labels = { empty:'Sem estoque',low:'Repor estoque',ok:'Em dia' };

function StockDialog({ product, catalog, onClose, onSubmit, busy }: { product?: InventoryProduct; catalog:ProductOption[]; onClose:()=>void; onSubmit:(body:Record<string,unknown>)=>Promise<void>; busy:boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef('');
  const [mode,setMode] = useState(product ? 'consumption' : 'configure');
  const [productId,setProductId] = useState(product?.id || catalog[0]?.id || '');
  const [message,setMessage] = useState('');
  const chosen = catalog.find(item => item.id === productId);
  const defaultUnit = product?.unit || (chosen ? stockUnit({ unit:chosen.defaultUnit,packageContent:chosen.packageContent || undefined }) : 'un');
  useEffect(() => { requestId.current = newExpenseRequestId(); dialog.current?.showModal(); const element = dialog.current; return () => element?.close(); },[]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const fields = new FormData(event.currentTarget);
    const body = mode === 'configure' ? { action:mode, productId, unit:fields.get('unit'), minimum:fields.get('minimum'), location:fields.get('location'), suppliers:String(fields.get('suppliers') || '').split(/[,;\n]/).map(value => value.trim()).filter(Boolean) }
      : { action:mode, productId:product?.id, quantity:fields.get('quantity'), date:fields.get('date'), reason:fields.get('reason'), expectedBalance:product?.balance,requestId:requestId.current };
    try { setMessage(''); await onSubmit(body); } catch (error) { setMessage(errorMessage(error)); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="stock-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit} className={styles.form} aria-busy={busy}>
      <div className={styles.dialogHeading}><div><span className="eyebrow">Controle de estoque</span><h2 id="stock-dialog-title">{product ? product.name : 'Adicionar produto ao estoque'}</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Fechar">×</button></div>
      <fieldset disabled={busy} className={styles.form}>
      {product ? <><p>Saldo atual: <strong>{qty(product.balance)} {product.unit}</strong></p><label>O que deseja fazer?<select value={mode} onChange={event => { setMode(event.target.value); setMessage(''); }}>
        <option value="consumption">Registrar consumo na cozinha</option><option value="waste">Registrar perda / vencimento</option><option value="entry">Registrar entrada avulsa</option><option value="count">Conferir contagem física</option><option value="configure">Editar mínimo e fornecedores</option>
      </select></label></> : <label>Produto cadastrado<select required value={productId} onChange={event => setProductId(event.target.value)}><option value="">Selecione</option>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {mode === 'configure' ? <div key={productId} className={styles.form}>
        <label>Unidade de controle<select name="unit" defaultValue={defaultUnit} disabled={!!product}>{STOCK_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select>{product && <input type="hidden" name="unit" value={product.unit} />}</label>
        <p className={styles.hint}>Quilos e litros são convertidos automaticamente a partir de gramas e mililitros. Informe o conteúdo dos pacotes na compra para convertê-los. A unidade fica fixa após a ativação.</p>
        <label>Estoque mínimo<input name="minimum" inputMode="decimal" defaultValue={product?.minimum || '0'} maxLength={18} required /></label>
        <label>Local de armazenamento<input name="location" defaultValue={product?.location} maxLength={120} placeholder="Ex.: Despensa, prateleira 2" /></label>
        <label>Fornecedores principais<textarea name="suppliers" defaultValue={product?.suppliers.join(', ')} maxLength={1200} rows={2} placeholder="Separe os nomes por vírgula" /></label>
        {!product && <p className={styles.hint}>Após ativar, use Entrada para registrar o saldo que você já possui. Compras antigas não são recebidas automaticamente.</p>}
      </div> : <div key={mode} className={styles.form}>
        {mode === 'entry' && <p className={styles.hint}>Para uma compra com custo, registre um lançamento e marque a entrada no estoque. Esta entrada avulsa altera apenas a quantidade, sem criar uma despesa.</p>}
        {mode === 'count' && <p className={styles.hint}>Informe o total contado agora. Vamos registrar apenas a diferença em relação ao saldo atual. Movimentos não são apagados: use uma nova entrada ou contagem para corrigir.</p>}
        <div className={styles.row}><label>{mode === 'count' ? 'Quantidade contada' : 'Quantidade'} ({product?.unit})<input name="quantity" inputMode="decimal" required maxLength={18} placeholder={mode === 'count' ? 'Pode ser zero' : 'Ex.: 2,5'} /></label><label>Data<input name="date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={todayInSaoPaulo()} required /></label></div>
        <label>Motivo / observações<textarea name="reason" minLength={2} maxLength={300} rows={3} required placeholder={mode === 'waste' ? 'Ex.: Produto vencido ou avariado' : 'Ex.: Preparo do almoço, conferência ou saldo inicial'} /></label>
      </div>}
      </fieldset>
      {message && <p className={styles.error} role="alert">{message}</p>}
      <div className={styles.actions}><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button><button className="button" disabled={busy || !productId}>{busy ? 'Salvando…' : 'Salvar'}</button></div>
    </form>
  </dialog>;
}

export default function InventoryPanel({ empresaId,initialData,catalog }: { empresaId:string; initialData:InventoryData; catalog:ProductOption[] }) {
  const [data,setData] = useState(initialData);
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('all');
  const [historyProduct,setHistoryProduct] = useState('');
  const [dialog,setDialog] = useState<{product?:InventoryProduct} | null>(null);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const requestSerial = useRef(0);
  const products = data.products.filter(product => (filter === 'all' || (filter === 'low' ? status(product) !== 'ok' : status(product) === filter)) && `${product.name} ${product.location} ${product.suppliers.join(' ')} ${product.purchasedFrom.map(item => item.name).join(' ')}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const available = catalog.filter(item => !item.archived && !data.products.some(product => product.id === item.id));
  const valued = data.products.filter(product => product.valueCents !== null);
  const value = valued.reduce((sum,product) => sum+BigInt(product.valueCents!),BigInt(0)).toString();
  async function reload(productId = historyProduct,page = 1) {
    const serial = ++requestSerial.current;
    setLoading(true);setError('');
    try {
      const result = await api.get<InventoryData>('/inventory',{params:{expectedEmpresaId:empresaId,productId:productId || undefined,page}});
      if (requestSerial.current === serial) { setData(result.data);setHistoryProduct(productId); }
    } catch (error) { if (requestSerial.current === serial) setError(errorMessage(error)); }
    finally { if (requestSerial.current === serial) setLoading(false); }
  }
  async function save(body:Record<string,unknown>) {
    if (busy) return; setBusy(true);setMessage('');
    try { await api.post('/inventory',{...body,empresaId});setDialog(null);setMessage('Estoque atualizado.');await reload(); }
    finally { setBusy(false); }
  }
  return <>
    <div className={styles.heading}><div><span className="eyebrow">Da compra à cozinha</span><h1 className="serif">Estoque</h1><p>Saiba o que tem, o que precisa repor e quanto seus insumos custam.</p></div><div className={styles.actions}><Link className="button button-outline" href="/dashboard/expenses">Registrar compra</Link><button className="button" disabled={!available.length} onClick={() => setDialog({})}>+ Controlar produto</button></div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.notice} role="status">{message}</p>}
    <div className={styles.stats}><div className={styles.featured}><span>Valor estimado em estoque</span><strong>{displayPrice(value)}</strong><small>{data.products.length-valued.length ? `${data.products.length-valued.length} produto(s) sem preço de compra para avaliar.` : 'Calculado pelo preço médio das compras.'}</small></div><div><span>Produtos controlados</span><strong>{data.products.length}</strong><small>Insumos, bebidas, limpeza e embalagens</small></div><div><span>Precisam de reposição</span><strong>{data.products.filter(product => status(product) !== 'ok').length}</strong><small>Saldo igual ou inferior ao mínimo</small></div><div><span>Sem estoque</span><strong>{data.products.filter(product => status(product) === 'empty').length}</strong><small>Confira antes do próximo preparo</small></div></div>
    <section className={styles.card} aria-labelledby="stock-list-title"><div className={styles.sectionHeading}><div><h2 id="stock-list-title">Seus produtos</h2><p>As compras recebidas entram automaticamente. Consumo e perdas são registrados pela equipe.</p></div><button className="button button-outline" onClick={() => void reload()} disabled={loading || busy}>{loading ? 'Atualizando…' : 'Atualizar estoque'}</button></div>
      <div className={styles.filters}><label>Buscar produto, local ou fornecedor<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ex.: arroz, despensa, mercado" /></label><label>Situação<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos os produtos</option><option value="low">Precisam de reposição</option><option value="empty">Sem estoque</option><option value="ok">Em dia</option></select></label></div>
      {!products.length ? <div className={styles.empty}><h3>{data.products.length ? 'Nenhum produto encontrado' : 'Sua despensa começa aqui'}</h3><p>{data.products.length ? 'Tente outra busca ou situação.' : 'Ative o estoque de um produto cadastrado ou marque “Adicionar esta quantidade ao estoque” ao lançar uma compra.'}</p><Link href="/dashboard/catalog" className="button button-outline">Ir para os cadastros</Link></div> : <div className={styles.grid}>{products.map(product => <article key={product.id} className={styles.product}>
        <div className={styles.productHeading}><h3>{product.name}</h3><span className={`${styles.badge} ${styles[status(product)]}`}>{labels[status(product)]}</span></div>
        {product.archived && <p className={styles.hint}>Produto arquivado. Reative em Cadastros para movimentá-lo.</p>}
        <div className={styles.balance}><strong>{qty(product.balance)}</strong><span>{product.unit}</span></div>
        <p className={styles.hint}>Mínimo: {qty(product.minimum)} {product.unit}{product.location ? ` · ${product.location}` : ''}</p>
        <dl><div><dt>Preço médio / {product.unit}</dt><dd>{product.averageCents === null ? 'Sem compras' : displayPrice(product.averageCents)}</dd></div><div><dt>Valor estimado</dt><dd>{product.valueCents === null ? 'Não disponível' : displayPrice(product.valueCents)}</dd></div><div><dt>Última compra</dt><dd>{product.lastPurchase ? day(product.lastPurchase) : 'Ainda não registrada'}</dd></div></dl>
        <details><summary>Fornecedores e compras</summary><p className={styles.hint}><strong>Principais:</strong> {product.suppliers.join(', ') || 'Não informados. Edite em Movimentar / editar.'}</p>{product.purchasedFrom.length ? <ul className={styles.vendors}>{product.purchasedFrom.map(vendor => <li key={vendor.name}><strong>{vendor.name}</strong><span>{qty(vendor.quantity)} {product.unit} · {displayPrice(vendor.amountCents)}</span></li>)}</ul> : <p className={styles.hint}>Nenhum fornecedor encontrado nas compras com esta unidade.</p>}</details>
        <div className={styles.actions}><button className="button" disabled={busy || product.archived} onClick={() => setDialog({product})}>Movimentar / editar</button><button className={styles.linkButton} onClick={() => { void reload(product.id);document.getElementById('stock-history')?.scrollIntoView({behavior:'smooth',block:'start'}); }}>Histórico</button></div>
      </article>)}</div>}
      <p className={styles.footnote}>Preço médio = total gasto ÷ quantidade comprada, considerando compras ativas na mesma unidade, recebidas ou não e pagas ou a pagar. Entradas avulsas não criam gastos. O valor estimado usa esse preço médio; produtos sem compras ficam sem avaliação.</p>
    </section>
    <section className={styles.card} id="stock-history" aria-labelledby="stock-history-title" aria-busy={loading}><div className={styles.sectionHeading}><div><h2 id="stock-history-title">Histórico de movimentações</h2><p>Compras recebidas e ajustes com data, motivo e responsável. Edições de compras atualizam as entradas correspondentes.</p></div><label>Produto<select value={historyProduct} disabled={loading} onChange={event => void reload(event.target.value)}><option value="">Todos os produtos</option>{data.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label></div>
      <div className={styles.tableWrap} tabIndex={0} aria-label="Histórico de estoque"><table><thead><tr><th>Data</th><th>Produto</th><th>Movimento</th><th>Quantidade</th><th>Motivo / fornecedor</th><th>Responsável</th></tr></thead><tbody>{data.movements.map(movement => <tr key={movement.id}><td>{day(movement.date)}</td><td>{movement.productName}</td><td>{sources[movement.source]}</td><td className={Number(movement.quantity)<0 ? styles.negative : styles.positive}>{Number(movement.quantity)>0 ? '+' : ''}{qty(movement.quantity)} {movement.unit}</td><td>{movement.reason}</td><td>{movement.author}</td></tr>)}</tbody></table>{!data.movements.length && <p className={styles.empty}>Nenhuma movimentação neste filtro.</p>}</div>
      <div className={styles.pagination}><button disabled={loading || data.page<=1} onClick={() => void reload(historyProduct,data.page-1)}>Anterior</button><span>Página {data.page}</span><button disabled={loading || !data.hasNext} onClick={() => void reload(historyProduct,data.page+1)}>Próxima</button></div>
    </section>
    {dialog && <StockDialog product={dialog.product} catalog={dialog.product ? catalog : available} onClose={() => setDialog(null)} onSubmit={save} busy={busy} />}
  </>;
}
