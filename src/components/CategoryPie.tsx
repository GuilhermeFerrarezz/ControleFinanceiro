'use client';
import { useState } from 'react';
import { EXPENSE_CATEGORIES, money, type ExpenseDashboardData, type ExpenseCategory } from '@/src/lib/expense-shared';
import styles from './finance.module.css';

function slicePath(start: number, fraction: number) {
  const point = (radius: number, value: number) => {
    const angle=(value*360-90)*Math.PI/180;
    return `${110+radius*Math.cos(angle)},${110+radius*Math.sin(angle)}`;
  };
  const mid=start+fraction/2, end=start+fraction;
  // Two arcs also render a full circle when there is only one category.
  return `M${point(100,start)} A100,100 0 0,1 ${point(100,mid)} A100,100 0 0,1 ${point(100,end)}
    L${point(68,end)} A68,68 0 0,0 ${point(68,mid)} A68,68 0 0,0 ${point(68,start)} Z`;
}
export default function CategoryPie({ categories,total,count }: { categories:ExpenseDashboardData['categories']; total:number; count:number }) {
  const [selectedId,setSelectedId] = useState<ExpenseCategory | null>(null);
  const selected=categories.find(item=>item.category===selectedId);
  const selectedCategory=EXPENSE_CATEGORIES.find(item=>item.id===selected?.category);
  const percent=(value:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value/total*100);
  return <>
    <div className={styles.interactiveDonut}><svg viewBox="0 0 220 220" role="group" aria-label="Gráfico interativo de gastos por categoria">
      {categories.map((item,index)=>{
        const category=EXPENSE_CATEGORIES.find(category=>category.id===item.category)!;
        const start=categories.slice(0,index).reduce((sum,row)=>sum+row.totalCents,0)/total;
        const choose=()=>setSelectedId(item.category);
        return <path key={item.category} d={slicePath(start,item.totalCents/total)} fill={category.color} className={styles.donutSlice}
          role="button" tabIndex={0} aria-label={`Selecionar categoria ${category.label}`} aria-pressed={selected?.category===item.category}
          opacity={selected && selected.category!==item.category ? .4 : 1} onClick={choose}
          onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}}}>
          <title>{`${category.label}: ${money(item.totalCents)} (${percent(item.totalCents)}%)`}</title>
        </path>;
      })}
    </svg><div className={styles.pieCenter} aria-hidden="true">{selected ? <><span>{selectedCategory?.label}</span><strong>{percent(selected.totalCents)}%</strong><small>{money(selected.totalCents)}</small></> : <><span>{categories.length} categorias</span><strong>{count}</strong><small>lançamentos</small></>}</div></div>
    <ul className={styles.interactiveLegend}>{categories.map(item=>{
      const category=EXPENSE_CATEGORIES.find(category=>category.id===item.category)!;
      return <li key={item.category}><button type="button" aria-label={`Detalhar ${category.label}`} aria-pressed={selected?.category===item.category} onClick={()=>setSelectedId(item.category)}><i style={{background:category.color}}/><span>{category.label}<small>{percent(item.totalCents)}% do total</small></span><strong>{money(item.totalCents)}</strong></button></li>;
    })}</ul>
    <div className={styles.pieDetails}><p role="status">{selected ? `${selectedCategory?.label}: ${money(selected.totalCents)} · ${percent(selected.totalCents)}% dos gastos do período.` : 'Clique ou toque em uma fatia para ver o nome e o valor da categoria.'}</p>{selected && <button type="button" className={styles.textButton} onClick={()=>setSelectedId(null)}>Ver todas as categorias</button>}</div>
  </>;
}
