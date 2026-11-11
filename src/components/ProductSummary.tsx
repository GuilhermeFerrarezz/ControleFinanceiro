'use client';
import ProductCharts from './ProductCharts';
import { useState } from 'react';
import { money, type ExpenseDashboardData, type ProductTotal } from '@/src/lib/expense-shared';
import styles from './finance.module.css';
export default function ProductSummary({ products, totalCents, daily = [], start, end }: { products: ProductTotal[]; totalCents: number; daily?: ExpenseDashboardData['productDaily']; start: string; end: string }) {
  const [query, setQuery] = useState('');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const filtered = products.filter(item => normalize(item.name).includes(normalize(query)));
  const detailed = products.reduce((sum, item) => sum + item.amountCents, 0);
  return <section className={`${styles.listCard} ${styles.productSummary}`} aria-labelledby="product-summary-title"><div className={styles.listHeading}><div><h2 id="product-summary-title">Compras por produto</h2><p>Quantidades e valores dos produtos informados em todo o período e filtros selecionados. Unidades diferentes aparecem separadas.</p><p>Detalhado: <strong>{money(detailed)}</strong> · Sem detalhamento: <strong>{money(totalCents - detailed)}</strong></p></div></div>
    {products.length ? <><ProductCharts products={products} daily={daily} start={start} end={end} /><label className={`${styles.field} ${styles.productSearch}`} htmlFor="product-search">Buscar produto<input id="product-search" type="search" placeholder="Ex.: carne ou batata frita" value={query} onChange={event => setQuery(event.target.value)} maxLength={120} /></label><div className={styles.tableWrap}><table className={styles.expenseTable}><caption className={styles.srOnly}>Totais por produto no período</caption><thead><tr><th>Produto</th><th>Quantidade comprada</th><th>Compras</th><th>Valor gasto</th></tr></thead><tbody>{filtered.map(item => <tr key={`${item.name}/${item.unit}`}><td data-label="Produto">{item.name}</td><td data-label="Quantidade comprada">{item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unit}</td><td data-label="Compras">{item.purchases}</td><td data-label="Valor gasto">{money(item.amountCents)}</td></tr>)}</tbody></table>{!filtered.length && <p className={styles.productSearch}>Nenhum produto com esse nome.</p>}</div></> : <p className={styles.productSearch}>Adicione produtos ao lançar um gasto para ver aqui quanto comprou e gastou com cada um.</p>}
  </section>;
}
