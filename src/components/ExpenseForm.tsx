'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import { PAYMENT_METHODS, newExpenseRequestId, parseMoneyInput, todayInSaoPaulo, type ExpenseRecord, type CategoryOption } from '@/src/lib/expense-shared';
import type { MerchantOption } from '@/src/lib/catalog-shared';
import MerchantInput from './MerchantInput';
import Icon from './Icon';
import styles from './finance.module.css';

export default function ExpenseForm({ expense, empresaId, categoryOptions, onClose, onSaved }: { expense?: ExpenseRecord; empresaId: string; categoryOptions: readonly CategoryOption[]; onClose: () => void; onSaved: (another: boolean) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const requestId = useRef<string>('');
  const [saving, setSaving] = useState(false);
  const [merchantBusy, setMerchantBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saveAnother, setSaveAnother] = useState(false);
  const [merchant, setMerchant] = useState(expense?.merchant || '');
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [categories, setCategories] = useState(categoryOptions);
  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ empresaId: string; categories: CategoryOption[]; merchants: MerchantOption[] }>('/catalog', { signal: controller.signal }).then(response => {
      if (response.data.empresaId === empresaId) { setMerchants(response.data.merchants); setCategories(response.data.categories); }
      else setMessage('O restaurante ativo mudou. Atualize a página.');
    }).catch(error => { if (!controller.signal.aborted) setMessage(errorMessage(error)); });
    return () => controller.abort();
  }, [empresaId]);
  useEffect(() => {
    requestId.current = newExpenseRequestId();
    const element = dialog.current; element?.showModal();
    form.current?.querySelector<HTMLInputElement>('[name="description"]')?.focus();
    return () => { element?.close(); };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || merchantBusy) return;
    const fields = new FormData(event.currentTarget);
    const amountCents = parseMoneyInput(String(fields.get('amount') || ''));
    if (amountCents === null) { setMessage('Informe o valor em reais. Exemplo: 125,90 ou 1.250,00.'); return; }
    const payload = { expectedEmpresaId: empresaId, description: fields.get('description'), amountCents, date: fields.get('date'), category: fields.get('category'), merchant, status: fields.get('status'), paymentMethod: fields.get('paymentMethod'), notes: fields.get('notes') };
    setSaving(true); setMessage('');
    try {
      if (expense) await api.patch(`/expenses/${expense.id}`, { ...payload, version: expense.version });
      else await api.post('/expenses', { ...payload, requestId: requestId.current });
      if (saveAnother && !expense) {
        requestId.current = newExpenseRequestId(); form.current?.reset(); setMerchant('');
        await onSaved(true); form.current?.querySelector<HTMLInputElement>('[name="description"]')?.focus();
      } else await onSaved(false);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="expense-form-title" onCancel={event => { event.preventDefault(); if (!saving && !merchantBusy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !saving && !merchantBusy) onClose(); }}>
    <div className={styles.dialogInner}><div className={styles.dialogHeading}><div><span className="eyebrow">Cada detalhe entra na conta</span><h2 id="expense-form-title">{expense ? 'Editar gasto' : 'Novo gasto'}</h2></div><button type="button" className={styles.iconButton} onClick={onClose} disabled={saving || merchantBusy} aria-label="Fechar formulário"><Icon name="close" /></button></div>
      <p className={styles.dialogIntro}>Preencha o essencial. Os campos com * são obrigatórios.</p>
      <form ref={form} onSubmit={submit} className={styles.expenseForm} aria-busy={saving || merchantBusy}>
        <label className={styles.field} htmlFor="expense-description">Descrição *<input id="expense-description" name="description" placeholder="Ex.: Compra de hortifruti ou pagamento de diária" minLength={2} maxLength={120} defaultValue={expense?.description} required autoFocus disabled={saving || merchantBusy} /></label>
        <div className={styles.formRow}><label className={styles.field} htmlFor="expense-amount">Valor (R$) *<input id="expense-amount" name="amount" inputMode="decimal" placeholder="0,00" defaultValue={expense ? (expense.amountCents / 100).toFixed(2).replace('.', ',') : ''} required disabled={saving || merchantBusy} autoComplete="off" maxLength={18} /></label>
          <label className={styles.field} htmlFor="expense-date">Data do gasto *<input id="expense-date" name="date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={expense?.date || todayInSaoPaulo()} required disabled={saving || merchantBusy} /></label></div>
        <label className={styles.field} htmlFor="expense-category">Categoria *<select id="expense-category" name="category" defaultValue={expense?.category || 'alimentos'} disabled={saving || merchantBusy}>{categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
        <MerchantInput onBusyChange={setMerchantBusy} value={merchant} onChange={setMerchant} merchants={merchants} onCreated={item => setMerchants(current => [...current.filter(existing => existing.id !== item.id), item])} empresaId={empresaId} disabled={saving || merchantBusy} />
        <div className={styles.formRow}><label className={styles.field} htmlFor="expense-status">Situação<select id="expense-status" name="status" defaultValue={expense?.status || 'paid'} disabled={saving || merchantBusy}><option value="paid">Pago</option><option value="pending">A pagar</option></select></label>
          <label className={styles.field} htmlFor="expense-method">Forma de pagamento<select id="expense-method" name="paymentMethod" defaultValue={expense?.paymentMethod || 'not_informed'} disabled={saving || merchantBusy}>{PAYMENT_METHODS.map(method => <option key={method.id} value={method.id}>{method.label}</option>)}</select></label></div>
        <details className={styles.moreDetails} open={!!expense?.notes}><summary>Observações opcionais</summary><label className={styles.field} htmlFor="expense-notes"><span className={styles.srOnly}>Observações</span><textarea id="expense-notes" name="notes" placeholder="Informações que ajudam a lembrar deste gasto" maxLength={1000} defaultValue={expense?.notes} rows={3} disabled={saving || merchantBusy} /></label></details>
        {!expense && <label className={styles.checkbox}><input type="checkbox" checked={saveAnother} onChange={event => setSaveAnother(event.target.checked)} disabled={saving || merchantBusy} />Continuar lançando após salvar</label>}
        {message && <p className={styles.error} role="alert">{message}</p>}
        <div className={styles.formActions}><button type="button" className="button button-outline" onClick={onClose} disabled={saving || merchantBusy}>Cancelar</button><button className="button" type="submit" disabled={saving || merchantBusy}><Icon name="check" size={18} />{saving ? 'Salvando...' : expense ? 'Salvar alterações' : 'Salvar gasto'}</button></div>
      </form>
    </div>
  </dialog>;
}
