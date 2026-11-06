'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import { decodeCsv } from '@/src/lib/csv-encoding';
import { displayDate, money, parseMoneyInput, type DailyRevenue } from '@/src/lib/expense-shared';
import styles from './finance.module.css';

export default function RevenueEditor({ empresaId, today, rows, canEdit }: {
  empresaId: string; today: string; rows: DailyRevenue[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(() => {
    const existing = rows.find(row => row.date === today);
    return existing ? (existing.totalCents / 100).toFixed(2).replace('.', ',') : '';
  });
  const amountInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{ count: number; rows: DailyRevenue[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<DailyRevenue | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deleteDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);

  async function removeRevenue() {
    if (!deleting || busy) return;
    setBusy(true); setDeleteError(''); setError(''); setNotice('');
    try {
      await api.delete('/revenue', { data: { empresaId, ...deleting, confirm: true } });
      if (date === deleting.date) setAmount('');
      setDeleting(null);
      setNotice(`Faturamento de ${displayDate(deleting.date)} excluído.`);
      router.refresh();
    } catch (cause) {
      setDeleteError(errorMessage(cause));
      router.refresh();
    } finally { setBusy(false); }
  }

  function chooseDate(value: string) {
    setDate(value);
    const existing = rows.find(row => row.date === value);
    setAmount(existing ? (existing.totalCents / 100).toFixed(2).replace('.', ',') : '');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const totalCents = parseMoneyInput(amount, true);
    if (totalCents === null) { setError('Informe um valor válido, como 1.250,90 ou 0,00.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api.post('/revenue', { mode: 'save', empresaId, date, totalCents });
      setNotice(`Faturamento de ${displayDate(date)} salvo.`);
      router.refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function reviewFile(file?: File) {
    setCsv(''); setPreview(null); setError(''); setNotice('');
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError('Selecione um CSV de até 2 MB.'); return; }
    setBusy(true);
    try {
      const content = decodeCsv(await file.arrayBuffer());
      const { data } = await api.post<{ count: number; rows: DailyRevenue[] }>('/revenue',
        { mode: 'preview', empresaId, csv: content }, { timeout: 30000 });
      setCsv(content); setPreview(data);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function importFile() {
    if (!preview || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await api.post<{ saved: number; skipped: number }>('/revenue',
        { mode: 'import', empresaId, csv }, { timeout: 30000 });
      setNotice(`Dias importados: ${data.saved}. Dias já cadastrados e preservados: ${data.skipped}.`);
      setCsv(''); setPreview(null); router.refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <>
    {canEdit && <section className={styles.filtersCard} aria-label="Registrar faturamento diário">
      <h2>Registrar o total do dia</h2>
      <p>Some os pedidos do dia e informe o valor total. Salvar novamente na mesma data atualiza o valor daquele dia.</p>
      <form className={styles.filters} onSubmit={submit}>
        <label className={styles.filterField}>Data<input type="date" min="2000-01-01" max="2100-12-31" value={date} onChange={event => chooseDate(event.target.value)} required /></label>
        <label className={styles.filterField}>Faturamento (R$)<input ref={amountInput} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Ex.: 1.250,90" required /></label>
        <button type="submit" className="button" disabled={busy}>Salvar faturamento</button>
      </form>
      <details className={styles.revenueImport}>
        <summary>Importar faturamento CSV</summary>
        <p>Use uma linha por dia, com as colunas Data e Faturamento. Dias já cadastrados serão preservados.</p>
        <a className={styles.textButton} href="/api/v1/revenue?format=template">Baixar modelo CSV</a>
        <label className={styles.filterField}>Arquivo CSV<input type="file" accept=".csv,text/csv" disabled={busy}
          onChange={event => { void reviewFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
        {preview && <div className={styles.importReview}>
          <strong>{preview.count} dias no arquivo</strong>
          <ul>{preview.rows.map(row => <li key={row.date}>{displayDate(row.date)} · {money(row.totalCents)}</li>)}</ul>
          <button className="button" type="button" disabled={busy} onClick={() => void importFile()}>Confirmar importação</button>
        </div>}
      </details>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>}
    <div className={styles.sheetScroll}>
      <table className={styles.sheetTable}>
        <caption className={styles.sheetCaption}>Faturamento registrado</caption>
        <thead><tr><th scope="col">Data</th><th scope="col">Faturamento</th>{canEdit && <th scope="col">Ações</th>}</tr></thead>
        <tbody>{[...rows].reverse().map(row => <tr key={row.date}>
          <th scope="row">{displayDate(row.date)}</th><td>{money(row.totalCents)}</td>
          {canEdit && <td><div className={styles.rowActions}>
            <button className={styles.textButton} type="button" disabled={busy} onClick={() => { chooseDate(row.date); amountInput.current?.focus(); }}>Editar</button>
            <button className={styles.textButton} type="button" disabled={busy} aria-label={`Excluir faturamento de ${displayDate(row.date)}`}
              onClick={() => { setDeleteError(''); setDeleting(row); }}>Excluir</button>
          </div></td>}
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className={styles.sheetCaption}>Nenhum dia registrado neste período.</p>}
    </div>
    {canEdit && <dialog ref={deleteDialog} className={`${styles.dialog} ${styles.confirmDialog}`} aria-labelledby="delete-revenue-title"
      onCancel={event => { event.preventDefault(); if (!busy) setDeleting(null); }}>
      {deleting && <div className={styles.dialogInner}>
        <h2 id="delete-revenue-title">Excluir faturamento?</h2>
        <p>O registro de {money(deleting.totalCents)} em {displayDate(deleting.date)} será excluído. O dia ficará sem faturamento informado.</p>
        {deleteError && <p className={styles.error} role="alert">{deleteError}</p>}
        <div className={styles.formActions}>
          <button className="button button-outline" type="button" autoFocus disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button>
          <button className={styles.dangerButton} type="button" disabled={busy} onClick={() => void removeRevenue()}>
            {busy ? 'Excluindo...' : 'Excluir faturamento'}
          </button>
        </div>
      </div>}
    </dialog>}
  </>;
}
