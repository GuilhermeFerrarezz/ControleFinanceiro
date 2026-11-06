'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { displayDate, money, type CategoryOption } from '@/src/lib/expense-shared';
import styles from './finance.module.css';

const orderEvent = 'saldo-da-casa:sheet-order';
function subscribe(listener: () => void) {
  window.addEventListener(orderEvent, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(orderEvent, listener);
    window.removeEventListener('storage', listener);
  };
}
function savedIds(snapshot: string) {
  try {
    const value: unknown = JSON.parse(snapshot);
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
  } catch { return []; }
}

export default function ExpenseSheetTable({ storageId, baseHref, manual, columns, rows, totalCents }: {
  storageId: string;
  baseHref: string;
  manual: boolean;
  columns: (CategoryOption & { totalCents: number })[];
  rows: { date: string; amounts: number[] }[];
  totalCents: number;
}) {
  const router = useRouter();
  const storageKey = `saldo-da-casa:sheet-order:${storageId}`;
  const snapshot = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(storageKey) ?? ''; }
    catch { return ''; }
  }, () => '');
  const [draft, setDraft] = useState<string[] | null>(null);
  const [sessionOrder, setSessionOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const index = new Map(columns.map((column, i) => [column.id, i]));
  const saved = sessionOrder ?? savedIds(snapshot);
  const visible = draft ?? (manual ? saved : []);
  const placed = visible.filter(id => index.has(id));
  const placedIds = new Set(placed);
  const ordered = [...placed, ...columns.map(item => item.id).filter(id => !placedIds.has(id))];
  const editing = draft !== null;

  function move(from: string, to: string) {
    if (!editing || from === to) return;
    const position = ordered.indexOf(to);
    if (position < 0 || !ordered.includes(from)) return;
    const updated = ordered.filter(id => id !== from);
    updated.splice(position, 0, from);
    setDraft(updated);
  }

  function save() {
    // Replace visible slots while preserving categories hidden by the current filters.
    const remaining = [...ordered];
    const next = saved.map(id => index.has(id) ? remaining.shift()! : id).concat(remaining);
    setSessionOrder(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event(orderEvent));
    } catch { /* The current view can still use the in-memory order. */ }
    setDraft(null);
    if (!manual) {
      const url = new URL(baseHref, window.location.origin);
      url.searchParams.set('sort', 'manual');
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }

  function cellHref(date: string, category: string) {
    const query = new URLSearchParams(baseHref.split('?')[1]);
    query.set('detailDate', date);
    query.set('detailCategory', category);
    return '/dashboard/sheet?' + query + '#detalhes-gastos';
  }

  return <>
    <div className={styles.sheetOrderActions}>
      {editing ? <>
        <button className="button" type="button" onClick={save}>Salvar ordem</button>
        <button className="button button-outline" type="button" onClick={() => setDraft(null)}>Cancelar</button>
        <span>Arraste pelo ícone ↔ ou use as setas para mover uma coluna.</span>
      </> : <button className="button button-outline" type="button" onClick={() => setDraft(ordered)} disabled={columns.length < 2}>Editar ordem</button>}
    </div>
    <div className={styles.sheetScroll} tabIndex={0} role="region" aria-label="Planilha de gastos por dia e categoria">
      <table className={styles.sheetTable}>
        <caption className={styles.sheetCaption}>Gastos diários por categoria</caption>
        <thead><tr>
          <th scope="col">Dia</th>
          {ordered.map((id, position) => {
            const item = columns[index.get(id)!];
            return <th key={id} scope="col" data-sheet-column={id}
              className={dragging === id || target === id ? styles.sheetDragActive : undefined}>
              {item.label}{item.archived && <small>Arquivada</small>}
              {editing && <div className={styles.sheetColumnActions}>
                <button type="button" aria-label={`Mover ${item.label} para a esquerda`} disabled={!position} onClick={() => move(id, ordered[position - 1])}>←</button>
                <span className={styles.sheetDragHandle} aria-hidden="true"
                  onPointerDown={event => {
                    if (event.button !== 0 || !event.isPrimary) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragging(id);
                  }}
                  onPointerMove={event => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    const header = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sheet-column]');
                    setTarget(header?.dataset.sheetColumn ?? null);
                  }}
                  onPointerUp={event => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    const header = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sheet-column]');
                    if (header?.dataset.sheetColumn) move(id, header.dataset.sheetColumn);
                  }}
                  onLostPointerCapture={() => { setDragging(null); setTarget(null); }}>↔</span>
                <button type="button" aria-label={`Mover ${item.label} para a direita`} disabled={position === ordered.length - 1} onClick={() => move(id, ordered[position + 1])}>→</button>
              </div>}
            </th>;
          })}
          <th scope="col">Total do dia</th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.date}>
          <th scope="row">{displayDate(row.date)}</th>
          {ordered.map(id => {
            const column = index.get(id)!;
            const amount = row.amounts[column];
            return <td key={id}>{amount ? <Link className={styles.sheetValueLink} href={cellHref(row.date, id)} prefetch={false}
              aria-label={`Ver gastos de ${columns[column].label} em ${displayDate(row.date)}: ${money(amount)}`}>{money(amount)}</Link> : '—'}</td>;
          })}
          <td><strong>{money(row.amounts.reduce((sum, amount) => sum + amount, 0))}</strong></td>
        </tr>)}</tbody>
        <tfoot><tr>
          <th scope="row">Total do período</th>
          {ordered.map(id => <td key={id}>{money(columns[index.get(id)!].totalCents)}</td>)}
          <td>{money(totalCents)}</td>
        </tr></tfoot>
      </table>
    </div>
  </>;
}
