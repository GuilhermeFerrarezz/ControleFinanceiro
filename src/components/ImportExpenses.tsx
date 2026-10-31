'use client';
import { useEffect,useRef,useState } from 'react';
import { api,errorMessage } from '@/src/lib/api';
import { downloadBlob } from '@/src/lib/browser-download';
import { displayDate,EXPENSE_CATEGORIES,money,type ExpenseInput } from '@/src/lib/expense-shared';
import Icon from './Icon';
import styles from './finance.module.css';
type Review={total:number;ready:number;duplicates:number;totalErrors:number;errors:{line:number;message:string}[];preview:(ExpenseInput&{line:number;duplicate:boolean})[];totalCents:number};
export default function ImportExpenses({onClose,onImported}:{onClose:()=>void;onImported:(result:{imported:number;duplicates:number;period:{start:string;end:string}})=>Promise<void>}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [csv,setCsv]=useState(''),[filename,setFilename]=useState(''),[review,setReview]=useState<Review|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  async function choose(file:File|undefined) {
    setReview(null);setError('');setCsv('');setFilename(file?.name||'');
    if(!file)return;
    if(file.size>2*1024*1024){setError('Selecione um arquivo de até 2 MB.');return;}
    setBusy(true);
    try {const bytes=await file.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}setCsv(text);}
    catch{setError('Não foi possível ler o arquivo. Selecione-o novamente.');}finally{setBusy(false);}
  }
  async function check() {
    setBusy(true);setError('');
    try{setReview((await api.post<Review>('/expenses/import',{csv,mode:'preview'},{timeout:30000})).data);}
    catch(error){setError(errorMessage(error));}finally{setBusy(false);}
  }
  async function confirm() {
    if(!review||review.totalErrors||!review.ready||busy)return;
    setBusy(true);setError('');
    try{const result=(await api.post('/expenses/import',{csv,mode:'import'},{timeout:120000})).data;await onImported(result);}
    catch(error){setError(errorMessage(error));setBusy(false);}
  }
  async function template() {
    setBusy(true);setError('');try{const response=await api.get('/expenses/import',{responseType:'blob'});downloadBlob(response.data,'modelo-lancamentos.csv');}catch(error){setError(errorMessage(error));}finally{setBusy(false);}
  }
  return <dialog ref={dialog} className={`${styles.dialog} ${styles.importDialog}`} aria-labelledby="import-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}><div className={styles.dialogInner}>
    <div className={styles.dialogHeading}><div><span className="eyebrow">Da planilha para o restaurante</span><h2 id="import-title">Importar lançamentos</h2></div><button type="button" className={styles.iconButton} aria-label="Fechar importação" disabled={busy} onClick={onClose}><Icon name="close"/></button></div>
    <p className={styles.dialogIntro}>Selecione um CSV e confira os dados antes de salvar. Até 2.000 lançamentos e 2 MB por arquivo. Novos gastos ficarão registrados em seu nome.</p>
    <button type="button" className={styles.textButton} disabled={busy} onClick={template}>Baixar modelo de CSV <Icon name="download" size={16}/></button>
    <label className={styles.field} htmlFor="import-file">Arquivo CSV<input id="import-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={event=>void choose(event.target.files?.[0])}/></label>
    <p className={styles.importHint}>Colunas obrigatórias: Data, Descrição, Valor e Categoria. Datas em dd/mm/aaaa ou aaaa-mm-dd. Use vírgula para centavos (125,90). O CSV exportado pelo sistema também é aceito. Registros já identificados no restaurante serão ignorados.</p>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {review&&<section className={styles.importReview} aria-label="Prévia da importação"><h3>Conferência de {filename}</h3><p role="status">{review.ready} novos · {review.duplicates} repetidos · {review.totalErrors} com erro</p><strong>Total a importar: {money(review.totalCents)}</strong>
      {!!review.totalErrors&&<div className={styles.error} role="alert"><strong>Corrija as linhas abaixo antes de importar.</strong><ul>{review.errors.map(row=><li key={row.line}>Linha {row.line}: {row.message}</li>)}</ul>{review.totalErrors>review.errors.length&&<p>Mostrando os primeiros {review.errors.length} erros.</p>}</div>}
      <ul className={styles.importRows}>{review.preview.map(row=><li key={row.line}><div><strong>{row.description}</strong><span>{displayDate(row.date)} · {EXPENSE_CATEGORIES.find(item=>item.id===row.category)?.label}</span><small>{row.duplicate?'Já identificado - será ignorado':`Linha ${row.line}`}</small></div><strong>{money(row.amountCents)}</strong></li>)}</ul>
      {review.total>10&&<p className={styles.importHint}>Prévia dos primeiros 10 registros. Todos os {review.total} registros foram conferidos.</p>}
    </section>}
    <div className={styles.formActions}><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="button" disabled={busy||!csv||(!!review&&(review.totalErrors>0||review.ready===0))} onClick={review?confirm:check}>{busy?'Processando...':review?(review.totalErrors?'Corrija o CSV para continuar':!review.ready?'Nenhum lançamento novo':`Importar ${review.ready} lançamentos`):'Conferir arquivo'}</button></div>
  </div></dialog>;
}
