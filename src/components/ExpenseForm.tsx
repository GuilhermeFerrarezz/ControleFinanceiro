'use client';
import { MAX_EXPENSE_ITEMS, parseQuantity, validateExpenseItems } from '@/src/lib/expense-items';
import { ITEM_UNITS, money } from '@/src/lib/expense-shared';
import { decimalCents } from '@/src/lib/financial-math';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import { PAYMENT_METHODS, newExpenseRequestId, parseMoneyInput, todayInSaoPaulo, type ExpenseRecord, type CategoryOption } from '@/src/lib/expense-shared';
import type { ProductOption, MerchantOption } from '@/src/lib/catalog-shared';
import ProductInput from './ProductInput';
import MerchantInput from './MerchantInput';
import Icon from './Icon';
import styles from './finance.module.css';

export default function ExpenseForm({ expense, empresaId, categoryOptions, onClose, onSaved }: { expense?: ExpenseRecord; empresaId: string; categoryOptions: readonly CategoryOption[]; onClose: () => void; onSaved: (another: boolean) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const requestId = useRef<string>('');
  const [items, setItems] = useState(() => (expense?.items || []).map(item => ({ productId: item.productId, name: item.name, quantity: String(item.quantity).replace('.', ','), unit: item.unit, amount: decimalCents(item.amountCents) })));
  const [amount, setAmount] = useState(expense ? decimalCents(expense.amountCents) : '');
  const itemTotal = items.reduce((sum, item) => sum + (parseMoneyInput(item.amount) || 0), 0);
  const total = parseMoneyInput(amount) || 0;
  function updateItem(index: number, patch: Partial<(typeof items)[number]>) { setItems(current => current.map((item, position) => position === index ? { ...item, ...patch } : item)); }
  const [saving, setSaving] = useState(false);
  const [merchantBusy, setMerchantBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saveAnother, setSaveAnother] = useState(false);
  const [merchant, setMerchant] = useState(expense?.merchant || '');
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [categories, setCategories] = useState(categoryOptions);
  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ empresaId: string; categories: CategoryOption[]; merchants: MerchantOption[]; products: ProductOption[] }>('/catalog', { params: { expectedEmpresaId: empresaId }, signal: controller.signal }).then(response => {
      if (response.data.empresaId === empresaId) { setMerchants(response.data.merchants); setProducts(response.data.products); setItems(current => current.map(item => { const product = response.data.products.find(product => product.id === item.productId); return product ? { ...item, name: product.name } : item; })); setCategories(response.data.categories); }
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
    let validatedItems;
    try { validatedItems = validateExpenseItems(items.map(item => ({ productId: item.productId, name: item.name, quantity: parseQuantity(item.quantity), unit: item.unit, amountCents: parseMoneyInput(item.amount) })), amountCents); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Confira os produtos.'); return; }
    const payload = { items: validatedItems, expectedEmpresaId: empresaId, description: fields.get('description'), amountCents, date: fields.get('date'), category: fields.get('category'), merchant, status: fields.get('status'), paymentMethod: fields.get('paymentMethod'), notes: fields.get('notes') };
    setSaving(true); setMessage('');
    try {
      if (expense) await api.patch(`/expenses/${expense.id}`, { ...payload, version: expense.version });
      else await api.post('/expenses', { ...payload, requestId: requestId.current });
      if (saveAnother && !expense) {
        requestId.current = newExpenseRequestId(); form.current?.reset(); setMerchant(''); setItems([]); setAmount('');
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
        <div className={styles.formRow}><label className={styles.field} htmlFor="expense-amount">Valor (R$) *<input id="expense-amount" name="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={event => setAmount(event.target.value)} required disabled={saving || merchantBusy} autoComplete="off" maxLength={18} /></label>
          <label className={styles.field} htmlFor="expense-date">Data do gasto *<input id="expense-date" name="date" type="date" min="2000-01-01" max="2100-12-31" defaultValue={expense?.date || todayInSaoPaulo()} required disabled={saving || merchantBusy} /></label></div>
        <section className={styles.purchaseItems} aria-label="Produtos da compra">
          <div><strong>O que você comprou?</strong><p>Opcional. Busque produtos já cadastrados, como arroz e feijão. Você também pode cadastrar novos itens. Se preferir, informe apenas o valor total acima.</p></div>
          {items.map((item, index) => <fieldset className={styles.purchaseItem} key={index} disabled={saving || merchantBusy}><legend>Produto {index + 1}</legend>
            <ProductInput value={item.name} unit={item.unit} products={products.filter(product => !product.archived || product.id === item.productId)} empresaId={empresaId} disabled={saving || merchantBusy} onBusyChange={setMerchantBusy}
              onChange={(name, product) => updateItem(index, { name, productId: product?.id, ...(product ? { unit: product.defaultUnit } : {}) })}
              onCreated={product => setProducts(current => [...current.filter(existing => existing.id !== product.id), product])} />
            <div className={styles.formRow}><label className={styles.field}>Quantidade<input inputMode="decimal" value={item.quantity} onChange={event => updateItem(index, { quantity: event.target.value })} placeholder="Ex.: 1,5" maxLength={12} required /></label>
              <label className={styles.field}>Unidade<select value={item.unit} onChange={event => updateItem(index, { unit: event.target.value as typeof item.unit })}>{ITEM_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select></label></div>
            <label className={styles.field}>Valor total deste produto (R$)<input inputMode="decimal" value={item.amount} onChange={event => updateItem(index, { amount: event.target.value })} placeholder="Ex.: 45,90 pelas 3 unidades" maxLength={18} required /></label>
            <button type="button" className={styles.textButton} onClick={() => setItems(current => current.filter((_, position) => position !== index))}>Remover produto {index + 1}</button>
          </fieldset>)}
          <button type="button" className={styles.textButton} disabled={saving || merchantBusy || items.length >= MAX_EXPENSE_ITEMS} onClick={() => setItems(current => [...current, { productId: undefined, name: '', quantity: '1', unit: 'un', amount: '' }])}>+ Adicionar produto</button>
          {!!items.length && <div aria-live="polite"><p>Produtos: <strong>{money(itemTotal)}</strong>{total >= itemTotal && total > 0 ? ` · Sem detalhamento: ${money(total - itemTotal)}` : total > 0 ? ' · A soma ultrapassa o valor da compra.' : ''}</p><button type="button" className={styles.textButton} disabled={saving || merchantBusy || !itemTotal || itemTotal > 9999999999} onClick={() => setAmount(decimalCents(itemTotal))}>Usar soma dos produtos como valor da compra</button></div>}
        </section>
        <label className={styles.field} htmlFor="expense-category">Categoria *<select id="expense-category" name="category" defaultValue={expense?.category || categories.find(item => !item.archived)?.id} required disabled={saving || merchantBusy}><option value="">Selecione uma categoria</option>{categories.filter(item => !item.archived || item.id === expense?.category).map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
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
