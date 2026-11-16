'use client';
import { formatPercent, ratioPercent, sumCents } from '@/src/lib/financial-math';
import { useState } from 'react';
import { donutSlicePath } from '@/src/lib/donut-path';
import { categoryInfo, EXPENSE_CATEGORIES, money, type CategoryOption, type ExpenseDashboardData, type ExpenseCategory } from '@/src/lib/expense-shared';
import styles from './finance.module.css';

export default function CategoryPie({ categories,total,count,options = EXPENSE_CATEGORIES, dimension = 'category', selectedKey, onSelect }: { categories:ExpenseDashboardData['categories']; total:number; count:number; options?: readonly CategoryOption[]; dimension?: 'category' | 'product'; selectedKey?: string | null; onSelect?: (id: string | null) => void }) {
  const [localSelected,setLocalSelected] = useState<ExpenseCategory | null>(null);
  const selectedId = selectedKey === undefined ? localSelected : selectedKey;
  function setSelectedId(id: string | null) { setLocalSelected(id); onSelect?.(id); }
  const noun = dimension === 'product' ? 'produto' : 'categoria';
  const plural = dimension === 'product' ? 'produtos' : 'categorias';
  const selected=categories.find(item=>item.category===selectedId);
  const selectedCategory=selected ? categoryInfo(selected.category, options) : undefined;
  const percent=(value:number)=>formatPercent(ratioPercent(value, total) ?? '0');
  return <>
    <div className={styles.interactiveDonut}><svg viewBox="0 0 220 220" role="group" aria-label={`Gráfico interativo de gastos por ${noun}`}>
      {categories.map((item,index)=>{
        const category=categoryInfo(item.category, options);
        const start=sumCents(categories.slice(0,index).map(row=>row.totalCents))/total;
        const choose=()=>setSelectedId(item.category);
        return <path key={item.category} d={donutSlicePath(start,item.totalCents/total)} fill={category.color} className={styles.donutSlice}
          role="button" tabIndex={0} aria-label={`Selecionar ${noun} ${category.label}`} aria-pressed={selected?.category===item.category}
          opacity={selected && selected.category!==item.category ? .4 : 1} onClick={choose}
          onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}}}>
          <title>{`${category.label}: ${money(item.totalCents)} (${percent(item.totalCents)}%)`}</title>
        </path>;
      })}
    </svg><div className={styles.pieCenter} aria-hidden="true">{selected ? <><span>{selectedCategory?.label}</span><strong>{percent(selected.totalCents)}%</strong><small>{money(selected.totalCents)}</small></> : <><span>{dimension === 'product' ? 'Itens detalhados' : `${categories.length} categorias`}</span><strong>{count}</strong><small>{dimension === 'product' ? 'produtos' : 'lançamentos'}</small></>}</div></div>
    <ul className={styles.interactiveLegend}>{categories.map(item=>{
      const category=categoryInfo(item.category, options);
      return <li key={item.category}><button type="button" aria-label={`Detalhar ${category.label}`} aria-pressed={selected?.category===item.category} onClick={()=>setSelectedId(item.category)}><i style={{background:category.color}}/><span>{category.label}<small>{percent(item.totalCents)}% do total</small></span><strong>{money(item.totalCents)}</strong></button></li>;
    })}</ul>
    <div className={styles.pieDetails}><p role="status">{selected ? `${selectedCategory?.label}: ${money(selected.totalCents)} · ${percent(selected.totalCents)}% dos gastos ${dimension === 'product' ? 'detalhados' : 'do período'}.` : `Clique ou toque em uma fatia para ver o nome e o valor ${dimension === 'product' ? 'do produto' : 'da categoria'}.`}</p>{selected && <button type="button" className={styles.textButton} onClick={()=>setSelectedId(null)}>Ver {dimension === 'product' ? 'todos os produtos' : `todas as ${plural}`}</button>}</div>
  </>;
}
