'use client';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import Icon from './Icon';
import styles from './finance.module.css';
export default function DemoDataControls({ count,onChanged }: { count:number; onChanged:(action:'restore'|'clear')=>Promise<void> }) {
  const [intent,setIntent] = useState<'restore'|'clear'|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{ if(intent) dialog.current?.showModal(); else dialog.current?.close(); },[intent]);
  async function confirm() {
    if (!intent || busy) return;
    const action=intent;
    setBusy(true);setError('');
    try { await api.post('/demo-data',{action});setIntent(null);await onChanged(action); }
    catch(error) { setError(errorMessage(error));setIntent(null); }
    finally { setBusy(false); }
  }
  return <>
    <aside className={styles.demoPanel} aria-label="Dados de exemplo"><div><span className={styles.demoLabel}>PARA EXPLORAR O SISTEMA</span><h2>Experimente com dados de exemplo</h2><p>{count ? `${count} exemplos no restaurante, distribuídos entre este mês e o anterior.` : 'Carregue gastos fictícios de todas as categorias para conhecer os gráficos e a lista.'} Você pode editar os exemplos e restaurá-los quando quiser.</p></div><div className={styles.demoActions}><button type="button" className="button button-outline" disabled={busy} onClick={()=>{setError('');setIntent('restore');}}><Icon name="chart" size={17}/>Restaurar exemplos</button><button type="button" className={styles.textButton} disabled={busy || count===0} onClick={()=>{setError('');setIntent('clear');}}><Icon name="trash" size={16}/>Excluir exemplos</button></div>{error && <p className={styles.error} role="alert">{error}</p>}</aside>
    <dialog ref={dialog} className={`${styles.dialog} ${styles.confirmDialog}`} aria-labelledby="demo-title" onCancel={event=>{event.preventDefault();if(!busy)setIntent(null);}}><div className={styles.dialogInner}><h2 id="demo-title">{intent==='clear'?'Excluir os exemplos?':'Restaurar os exemplos?'}</h2><p>{intent==='clear'?'Os gastos marcados como Exemplo sairão da lista e dos gráficos. Você poderá restaurá-los depois.':'O conjunto de 54 gastos fictícios será recriado para este mês e o anterior. Alterações feitas nos exemplos serão substituídas.'} Seus gastos reais serão preservados.</p><div className={styles.formActions}><button type="button" className="button button-outline" disabled={busy} onClick={()=>setIntent(null)}>Cancelar</button><button type="button" className="button" disabled={busy} onClick={confirm}>{busy?'Atualizando...':intent==='clear'?'Excluir exemplos':'Restaurar exemplos'}</button></div></div></dialog>
  </>;
}
