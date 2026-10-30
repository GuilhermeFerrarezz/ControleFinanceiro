'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, newExpenseRequestId, parseMoneyInput, todayInSaoPaulo, type ExpenseRecord } from '@/src/lib/expense-shared';
import Icon from './Icon';
import styles from './finance.module.css';

export default function ExpenseForm({ expense, onClose, onSaved }: { expense?: ExpenseRecord; onClose: () => void; onSaved: (another: boolean) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const requestId = useRef<string>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveAnother, setSaveAnother] = useState(false);
  useEffect(() => {
    requestId.current = newExpenseRequestId();
    const element = dialog.current; element?.showModal();
    form.current?.querySelector<HTMLInputElement>('[name="description"]')?.focus();
    return () => { element?.close(); };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    const fields = new FormData(event.currentTarget);
    const amountCents = parseMoneyInput(String(fields.get('amount') || ''));
    if (amountCents === null) { setMessage('Informe o valor em reais. Exemplo: 125,90 ou 1.250,00.'); return; }
    const payload = { description: fields.get('description'), amountCents, date: fields.get('date'), category: fields.get('category'), merchant: fields.get('merchant'), status: fields.get('status'), paymentMethod: fields.get('paymentMethod'), notes: fields.get('notes') };
    setSaving(true); setMessage('');
    try {
      if (expense) await api.patch(`/expenses/${expense.id}`, { ...payload, version: expense.version });
      else await api.post('/expenses', { ...payload, requestId: requestId.current });
      if (saveAnother && !expense) {
        requestId.current = newExpenseRequestId(); form.current?.reset();
        await onSaved(true); form.current?.querySelector<HTMLInputElement>('[name="description"]')?.focus();
      } else await onSaved(false);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="expense-form-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <div className={styles.dialogInner}><div className={styles.dialogHeading}><div><span className="eyebrow">Cada detalhe entra na conta</span><h2 id="expense-form-title">{expense ? 'Editar gasto' : 'Novo gasto'}</h2></div><button type="button" className={styles.iconButton} onClick={onClose} disabled={saving} aria-label="Fechar formulário"><Icon name="close" /></button></div>
      <p className={styles.dialogIntro}>Preencha o essencial. Os campos com * são obrigatórios.</p>
      <form ref={form} onSubmit={submit} className={styles.expenseForm} aria-busy={saving}>
        <label className={styles.field} htmlFor="expense-description">Descrição *<input id="expense-description" name="description" placeholder="Ex.: Compra de hortifruti ou pagamento de diária" minLength={2} maxLength={120} defaultValue={expense?.description} required autoFocus disabled={saving} /></label>
        <div className={styles.formRow}><label className={styles.field} htmlFor="expense-amount">Valor (R$) *<input id="expense-amount" name="amount" inputMode="decimal" placeholder="0,00" defaultValue={expense ? (expense.amountCents / 100).toFixed(2).replace('.', ',') : ''} required disabled={saving} autoComplete="off" maxLength={18} /></label>
          <label className={styles.field} htmlFor="expense-date">Data do gasto *<input id="expense-date" name="date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={expense?.date || todayInSaoPaulo()} required disabled={saving} /></label></div>
        <label className={styles.field} htmlFor="expense-category">Categoria *<select id="expense-category" name="category" defaultValue={expense?.category || 'alimentos'} disabled={saving}>{EXPENSE_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
        <label className={styles.field} htmlFor="expense-merchant">Local de compra / favorecido<input id="expense-merchant" name="merchant" placeholder="Ex.: Mercado Central, fornecedor ou nome do funcionário" defaultValue={expense?.merchant} maxLength={120} disabled={saving} /></label>
        <div className={styles.formRow}><label className={styles.field} htmlFor="expense-status">Situação<select id="expense-status" name="status" defaultValue={expense?.status || 'paid'} disabled={saving}><option value="paid">Pago</option><option value="pending">A pagar</option></select></label>
          <label className={styles.field} htmlFor="expense-method">Forma de pagamento<select id="expense-method" name="paymentMethod" defaultValue={expense?.paymentMethod || 'not_informed'} disabled={saving}>{PAYMENT_METHODS.map(method => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label></div>
        <details className={styles.moreDetails} open={!!expense?.notes}><summary>Observações opcionais</summary><label className={styles.field} htmlFor="expense-notes"><span className={styles.srOnly}>Observações</span><textarea id="expense-notes" name="notes" placeholder="Informações que ajudam a lembrar deste gasto" maxLength={1000} defaultValue={expense?.notes} rows={3} disabled={saving} /></label></details>
        {!expense && <label className={styles.checkbox}><input type="checkbox" checked={saveAnother} onChange={event => setSaveAnother(event.target.checked)} disabled={saving} />Continuar lançando após salvar</label>}
        {message && <p className={styles.error} role="alert">{message}</p>}
        <div className={styles.formActions}><button type="button" className="button button-outline" onClick={onClose} disabled={saving}>Cancelar</button><button className="button" type="submit" disabled={saving}><Icon name="check" size={18} />{saving ? 'Salvando...' : expense ? 'Salvar alterações' : 'Salvar gasto'}</button></div>
      </form>
    </div>
  </dialog>;
}
