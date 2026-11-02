'use client';
import { useState, type KeyboardEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import { normalizeCatalogName, type MerchantOption } from '@/src/lib/catalog-shared';
import styles from './finance.module.css';

export default function MerchantInput({ value, onChange, merchants, onCreated, onBusyChange, empresaId, disabled }: {
  value: string; onChange: (value: string) => void; merchants: MerchantOption[];
  onCreated: (merchant: MerchantOption) => void; onBusyChange: (busy: boolean) => void; empresaId: string; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const query = normalizeCatalogName(value);
  const matches = merchants.filter(item => normalizeCatalogName(item.name).includes(query))
    .sort((a, b) => Number(normalizeCatalogName(b.name).startsWith(query)) - Number(normalizeCatalogName(a.name).startsWith(query))).slice(0, 8);
  const canCreate = value.trim().length >= 2 && !merchants.some(item => normalizeCatalogName(item.name) === query);
  const size = matches.length + (canCreate ? 1 : 0);
  const expanded = open && !disabled && !busy && size > 0;
  async function select(index: number) {
    if (busy || disabled) return;
    if (index < matches.length) { onChange(matches[index].name); setOpen(false); setActive(-1); return; }
    if (!canCreate) return;
    setBusy(true); onBusyChange(true); setMessage('');
    try {
      const response = await api.post<MerchantOption>('/catalog', { empresaId, kind: 'merchant', name: value });
      onCreated(response.data); onChange(response.data.name); setOpen(false); setActive(-1);
      setMessage('Local cadastrado e selecionado.');
    } catch (err) { setMessage(errorMessage(err)); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      if (size) setActive(previous => event.key === 'ArrowDown' ? (previous + 1) % size : (previous <= 0 ? size - 1 : previous - 1));
    }
    if (event.key === 'Enter' && expanded && active >= 0 && active < size) { event.preventDefault(); void select(active); }
  }
  return <div className={styles.merchantField} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
    <label className={styles.field} htmlFor="expense-merchant">Local de compra / favorecido
      <input id="expense-merchant" name="merchant" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls="merchant-suggestions" aria-activedescendant={expanded && active >= 0 ? `merchant-option-${active}` : undefined}
        aria-describedby="merchant-hint" autoComplete="off" placeholder="Digite para buscar ou cadastrar um local" value={value} maxLength={120} disabled={disabled || busy}
        onFocus={() => setOpen(true)} onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); setMessage(''); }} onKeyDown={keyDown} />
    </label>
    <ul id="merchant-suggestions" role="listbox" aria-label="Locais sugeridos" className={styles.merchantSuggestions} hidden={!expanded}>
      {matches.map((item, index) => <li key={item.id} id={`merchant-option-${index}`} role="option" aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => void select(index)}>{item.name}</li>)}
      {canCreate && <li id={`merchant-option-${matches.length}`} role="option" aria-selected={active === matches.length} onMouseDown={event => event.preventDefault()} onClick={() => void select(matches.length)}>+ Cadastrar “{value.trim()}”</li>}
    </ul>
    <small id="merchant-hint" className={styles.importHint}>Selecione uma sugestão ou mantenha o texto digitado. Cadastrar o local é opcional.</small>
    {(busy || (message && value)) && <p className={styles.importHint} role="status">{busy ? 'Cadastrando local...' : message}</p>}
  </div>;
}
