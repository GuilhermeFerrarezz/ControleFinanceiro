'use client';
import { useState } from 'react';
import styles from './auth.module.css';
import { STOCK_UNITS } from '@/src/lib/inventory-shared';

export function stockSetupData(fields: FormData) {
  return { trackStock:fields.get('trackStock') === 'on', unit:fields.get('stockUnit') || undefined,
    minimum:fields.get('stockMinimum') || '0', location:fields.get('stockLocation') || '',
    suppliers:String(fields.get('stockSuppliers') || '').split(/[,;\n]/).map(value => value.trim()).filter(Boolean),
    initialQuantity:fields.get('stockInitial') || '0' };
}
export default function StockSetupFields({ disabled }: { disabled: boolean }) {
  const [enabled,setEnabled] = useState(false);
  return <fieldset disabled={disabled} style={{ border:'1px solid #dbe2d0',borderRadius:8,padding:16,minWidth:0 }}>
    <label><input type="checkbox" name="trackStock" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Controlar este produto no estoque</label>
    {enabled && <div className={styles.form} style={{ marginTop:16 }}>
      <p>O saldo inicial é a quantidade que você já possui. As compras antigas não entram automaticamente no estoque.</p>
      <label className={styles.field}>Unidade de controle<select className={styles.input} name="stockUnit"><option value="">Usar a unidade do produto / conteúdo da embalagem</option>{STOCK_UNITS.map(unit => <option key={unit}>{unit}</option>)}</select></label>
      <label className={styles.field}>Quantidade inicial<input className={styles.input} inputMode="decimal" name="stockInitial" placeholder="0" maxLength={18} /></label>
      <label className={styles.field}>Estoque mínimo<input className={styles.input} inputMode="decimal" name="stockMinimum" placeholder="0" maxLength={18} /></label>
      <label className={styles.field}>Local de armazenamento<input className={styles.input} name="stockLocation" placeholder="Ex.: Câmara fria, prateleira 2" maxLength={120} /></label>
      <label className={styles.field}>Fornecedores principais<input className={styles.input} name="stockSuppliers" placeholder="Separe os nomes por vírgula" maxLength={1200} /></label>
    </div>}
  </fieldset>;
}
