'use client';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import { displayDate } from '@/src/lib/expense-shared';
import Icon from './Icon';
import styles from './finance.module.css';

export default function DeleteExpensePeriod({ empresaId, restaurantName, start, end, disabled, onDeleted }: {
  empresaId: string; restaurantName: string; start: string; end: string; disabled: boolean;
  onDeleted: (count: number) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [senha, setSenha] = useState('');
  function close() { setSenha(''); setPeriod(null); }
  useEffect(() => { if (period) dialog.current?.showModal(); else dialog.current?.close(); }, [period]);
  async function remove() {
    if (!period || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api.delete<{ deleted: number }>('/expenses', {
        data: { empresaId, ...period, confirm: true, senha }, timeout: 60000,
      });
      close();
      await onDeleted(result.data.deleted);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <>
    <button className={styles.textButton} disabled={disabled || busy} onClick={() => { setError(''); setSenha(''); setPeriod({ start, end }); }}><Icon name="trash" size={16} />Excluir lançamentos do período</button>
    <dialog ref={dialog} className={`${styles.dialog} ${styles.confirmDialog}`} aria-labelledby="delete-period-title" aria-describedby="delete-period-description" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
      <div className={styles.dialogInner} aria-busy={busy}>
        <span className={styles.deleteIcon}><Icon name="trash" size={27} /></span>
        <h2 id="delete-period-title">Excluir todos os lançamentos?</h2>
        <p id="delete-period-description">Você realmente deseja excluir todos os lançamentos de <strong>{restaurantName}</strong> entre <strong>{displayDate(period?.start || start)}</strong> e <strong>{displayDate(period?.end || end)}</strong>, incluindo as duas datas?</p>
        <p>Serão excluídos os lançamentos de todas as categorias e situações, de todos os membros da equipe, mesmo os que não aparecem nesta página por causa dos filtros ou da paginação.</p>
        <p>Os registros sairão da lista, dos totais e dos gráficos. O histórico da operação será preservado. Não há opção de desfazer pela tela.</p>
        <label className={styles.field} htmlFor="delete-period-password">Confirme sua senha de administrador
          <input id="delete-period-password" type="password" autoComplete="current-password" required value={senha} disabled={busy} onChange={event => setSenha(event.target.value)} />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.formActions}>
          <button autoFocus className="button button-outline" disabled={busy} onClick={close}>Cancelar</button>
          <button className={styles.dangerButton} disabled={busy || !senha} onClick={remove}>{busy ? 'Excluindo...' : 'Sim, excluir todos do período'}</button>
        </div>
      </div>
    </dialog>
  </>;
}
