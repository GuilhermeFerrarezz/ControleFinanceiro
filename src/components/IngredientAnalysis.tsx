'use client';
import { useState } from 'react';
import { displayDate, money, type IngredientDay, type ProductTotal } from '@/src/lib/expense-shared';
import { displayPrice, displayQuantity, ingredientPrice, ingredientPriceSeries, priceChange } from '@/src/lib/ingredient-analysis';
import { formatPercent } from '@/src/lib/financial-math';
import { normalizeCatalogName } from '@/src/lib/catalog-shared';
import MoneyTrendChart from './MoneyTrendChart';
import styles from './finance.module.css';
export default function IngredientAnalysis({ products, daily, start, end }: { products: ProductTotal[]; daily: IngredientDay[]; start: string; end: string }) {
  const key = (item: ProductTotal) => `${item.productId || item.name}/${item.unit}`;
  const [selectedKey, setSelectedKey] = useState('');
  const [query, setQuery] = useState('');
  const selected = products.find(item => key(item) === selectedKey) || products[0];
  const filtered = products.filter(item => normalizeCatalogName(item.name).includes(normalizeCatalogName(query)));
  const average = (item: ProductTotal) => item.averagePriceCents || ingredientPrice(item.amountCents, item.quantityText || String(item.quantity)) || '0';
  const selectedPrice = selected ? average(selected) : '0';
  const series = selected ? ingredientPriceSeries(daily, selected.productId || selected.name, selected.unit, start, end) : null;
  return <section className={styles.ingredientAnalysis} aria-labelledby="ingredient-title"><div className={styles.listHeading}><div><h3 id="ingredient-title">Quantidades e preços dos insumos</h3><p>kg e g são reunidos em kg; L e ml, em L. Pacotes e caixas são convertidos quando o conteúdo foi informado na compra.</p><p>O preço médio divide o valor gasto pela quantidade total comprada. A variação compara as duas últimas compras do período na mesma medida.</p></div></div>
    <label className={`${styles.field} ${styles.productSearch}`} htmlFor="ingredient-search">Buscar insumo<input id="ingredient-search" type="search" placeholder="Ex.: arroz ou óleo" value={query} onChange={event => setQuery(event.target.value)} maxLength={120} /></label>
    <div className={styles.tableWrap}><table className={styles.expenseTable}><caption className={styles.srOnly}>Compras, quantidade normalizada e custo por medida</caption><thead><tr><th>Insumo</th><th>Quantidade total</th><th>Compras</th><th>Valor gasto</th><th>Preço médio</th><th>Último preço</th><th>Variação</th></tr></thead><tbody>{filtered.map(item => {
      const [last, previous] = item.recentPrices || [];
      const change = last && previous ? priceChange(last.priceCents, previous.priceCents) : null;
      return <tr key={key(item)}><td data-label="Insumo"><button type="button" className={styles.textButton} onClick={() => setSelectedKey(key(item))} aria-label={`Ver preço de ${item.name} por ${item.unit}`}>{item.name}</button>{(item.unit === 'pacote' || item.unit === 'caixa') && <small>Conteúdo não informado: comparação por {item.unit}.</small>}</td>
        <td data-label="Quantidade total">{displayQuantity(item.quantityText || String(item.quantity))} {item.unit}</td><td data-label="Compras">{item.purchases}</td><td data-label="Valor gasto">{money(item.amountCents)}</td>
        <td data-label="Preço médio">{displayPrice(average(item))}/{item.unit}</td><td data-label="Último preço">{last ? <>{displayPrice(last.priceCents)}/{item.unit}<small className={styles.priceDate}>{displayDate(last.date)}</small></> : '—'}</td>
        <td data-label="Variação" className={change?.startsWith('-') ? styles.priceDown : change && change !== '0' ? styles.priceUp : undefined} title={last && previous ? `${displayDate(previous.date)} a ${displayDate(last.date)}` : undefined}>{change === null ? 'Sem comparação' : change === '0' ? 'Sem variação' : `${change.startsWith('-') ? '' : '+'}${formatPercent(change)}%`}</td></tr>;
    })}</tbody></table>{!filtered.length && <p className={styles.productSearch}>Nenhum insumo com esse nome.</p>}</div>
    {selected && series && <div className={styles.ingredientPriceCard}>
      <label className={styles.field} htmlFor="ingredient-price-select">Acompanhar preço por medida<select id="ingredient-price-select" value={key(selected)} onChange={event => setSelectedKey(event.target.value)}>{products.map(item => <option key={key(item)} value={key(item)}>{item.name} · por {item.unit}</option>)}</select></label>
      {BigInt(selectedPrice) <= BigInt(Number.MAX_SAFE_INTEGER) ? <MoneyTrendChart titleId="ingredient-price-title" title={`Preço de ${selected.name} por ${selected.unit}`} metric={`Preço por ${selected.unit}`} readoutLabel="Preço médio ponderado" emptyTitle="Sem compras comparáveis" peakLabel="Maior preço no gráfico" daysLabel="Dias com compras comparáveis"
        series={series.series} interval={series.interval} start={start} end={end} totalCents={Number(selectedPrice)} peak={series.peak} recordedDays={daily.filter(day => day.productId === selected.productId && day.unit === selected.unit).length} hasRecords={daily.some(day => day.productId === selected.productId && day.unit === selected.unit)} /> : <p>Preço médio: {displayPrice(selectedPrice)}/{selected.unit}. Valor acima do intervalo suportado pelo gráfico.</p>}
      <p className={styles.importHint}>Cada ponto usa a média ponderada das compras daquele dia, mês ou ano. Períodos sem compra ficam em branco. Compras medem aquisição; não controlam estoque ou consumo.</p>
    </div>}
  </section>;
}
