'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/src/lib/api';
import { type CategoryOption } from '@/src/lib/expense-shared';
import { type MerchantOption } from '@/src/lib/catalog-shared';
import styles from '../dashboard.module.css';
import formStyles from '@/src/components/auth.module.css';
function CatalogSection({ empresaId, kind, items }: { empresaId: string; kind: 'category' | 'merchant'; items: MerchantOption[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();
  const category = kind === 'category';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    const name = new FormData(form).get('name');
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.post<MerchantOption>('/catalog', { empresaId, kind, name });
      form.reset(); setNotice(`“${response.data.name}” está disponível para os lançamentos.`); router.refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className={styles.teamCard}><h2>{category ? 'Categorias' : 'Locais / favorecidos'}</h2>
    <p className={styles.subtitle}>{category ? 'As categorias padrão continuam disponíveis. Adicione outras para organizar seus gastos.' : 'Cadastre mercados, fornecedores e favorecidos para encontrá-los ao digitar um lançamento.'}</p>
    <form className={formStyles.form} onSubmit={submit} aria-busy={busy}>
      <label className={formStyles.field} htmlFor={`catalog-${kind}`}>{category ? 'Nome da categoria' : 'Nome do local'}<input id={`catalog-${kind}`} className={formStyles.input} name="name" minLength={2} maxLength={120} required disabled={busy} placeholder={category ? 'Ex.: Marketing' : 'Ex.: Atacadão'} /></label>
      <button className={formStyles.button} disabled={busy}>{busy ? 'Salvando...' : category ? 'Cadastrar categoria' : 'Cadastrar local'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.teamNotice} role="status">{notice}</p>}
    <ul className={styles.catalogList} aria-label={category ? 'Categorias cadastradas' : 'Locais cadastrados'}>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
    {!items.length && <p className={styles.subtitle}>Nenhum local cadastrado ainda.</p>}
  </section>;
}
export default function CatalogPanel({ empresaId, categories, merchants }: { empresaId: string; categories: CategoryOption[]; merchants: MerchantOption[] }) {
  return <div className={styles.teamGrid}><CatalogSection empresaId={empresaId} kind="category" items={categories.map(item => ({ id: item.id, name: item.label }))} /><CatalogSection empresaId={empresaId} kind="merchant" items={merchants} /></div>;
}
