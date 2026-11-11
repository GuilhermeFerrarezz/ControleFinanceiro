'use client';
import { useState } from 'react';
import { CONTENT_UNITS, ITEM_UNITS, type PackageContent } from '@/src/lib/expense-shared';
import { parseQuantity } from '@/src/lib/expense-items';
import styles from './finance.module.css';
export function packagingFormData(fields: FormData) {
  const defaultUnit = String(fields.get('defaultUnit') || 'un');
  const quantity = String(fields.get('packageQuantity') || '').trim();
  return { defaultUnit, packageContent: (defaultUnit === 'pacote' || defaultUnit === 'caixa') && quantity ? { quantity: parseQuantity(quantity), unit: fields.get('packageUnit') } : null };
}
export default function ProductPackagingFields({ initialUnit = 'un', content, disabled }: { initialUnit?: typeof ITEM_UNITS[number]; content?: PackageContent | null; disabled: boolean }) {
  const [unit, setUnit] = useState(initialUnit);
  return <div className={styles.packagingFields}>
    <label className={styles.field}>Unidade sugerida<select name="defaultUnit" value={unit} onChange={event => setUnit(event.target.value as typeof unit)} disabled={disabled}>{ITEM_UNITS.map(value => <option key={value}>{value}</option>)}</select></label>
    {(unit === 'pacote' || unit === 'caixa') && <div className={styles.formRow}>
      <label className={styles.field}>Conteúdo de cada {unit}<input name="packageQuantity" inputMode="decimal" placeholder="Ex.: 5" defaultValue={content ? String(content.quantity).replace('.', ',') : ''} maxLength={12} disabled={disabled} /></label>
      <label className={styles.field}>Medida do conteúdo<select name="packageUnit" defaultValue={content?.unit || 'kg'} disabled={disabled}>{CONTENT_UNITS.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>}
    {(unit === 'pacote' || unit === 'caixa') && <small className={styles.importHint}>Opcional. Ex.: pacote com 5 kg ou caixa com 12 un. Usado para comparar o preço por medida nas próximas compras.</small>}
  </div>;
}
