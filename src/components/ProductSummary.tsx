'use client';
import ProductCharts from './ProductCharts';
import IngredientAnalysis from './IngredientAnalysis';
import { money, type ExpenseDashboardData, type ProductTotal } from '@/src/lib/expense-shared';
import styles from './finance.module.css';
export default function ProductSummary({ products, totalCents, daily = [], ingredientDaily = [], start, end }: { products: ProductTotal[]; totalCents: number; daily?: ExpenseDashboardData['productDaily']; ingredientDaily?: ExpenseDashboardData['ingredientDaily']; start: string; end: string }) {
  const detailed = products.reduce((sum, item) => sum + item.amountCents, 0);
  return <section className={`${styles.listCard} ${styles.productSummary}`} aria-labelledby="product-summary-title"><div className={styles.listHeading}><div><h2 id="product-summary-title">Compras por produto</h2><p>Quantidades e valores dos produtos informados em todo o período e filtros selecionados. Medidas equivalentes são reunidas na análise de insumos.</p><p>Detalhado: <strong>{money(detailed)}</strong> · Sem detalhamento: <strong>{money(totalCents - detailed)}</strong></p></div></div>
    {products.length ? <><ProductCharts products={products} daily={daily} start={start} end={end} /><IngredientAnalysis products={products} daily={ingredientDaily} start={start} end={end} /></> : <p className={styles.productSearch}>Adicione produtos ao lançar um gasto para ver aqui quanto comprou e gastou com cada um.</p>}
  </section>;
}
