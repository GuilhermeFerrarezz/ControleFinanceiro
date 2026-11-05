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
  const [action, setAction] = useState<{ type: 'edit' | 'delete'; item: MerchantOption } | null>(null);
  const router = useRouter();
  const category = kind === 'category';
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!action || busy) return;
    const data = { empresaId, kind, id: action.item.id, previousName: action.item.name, name: new FormData(event.currentTarget).get('name'), confirm: true };
    setBusy(true); setError(''); setNotice('');
    try {
      if (action.type === 'delete') await api.delete('/catalog', { data });
      else await api.patch('/catalog', data);
      setNotice(action.type === 'delete' ? 'Cadastro excluído. Os lançamentos existentes foram preservados.' : 'Cadastro atualizado.');
      setAction(null); router.refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
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
    <p className={styles.subtitle}>{category ? 'Cadastre, renomeie ou exclua categorias para organizar seus gastos.' : 'Cadastre mercados, fornecedores e favorecidos para encontrá-los ao digitar um lançamento.'}</p>
    <form className={formStyles.form} onSubmit={submit} aria-busy={busy}>
      <label className={formStyles.field} htmlFor={`catalog-${kind}`}>{category ? 'Nome da categoria' : 'Nome do local'}<input id={`catalog-${kind}`} className={formStyles.input} name="name" minLength={2} maxLength={120} required disabled={busy} placeholder={category ? 'Ex.: Marketing' : 'Ex.: Atacadão'} /></label>
      <button className={formStyles.button} disabled={busy}>{busy ? 'Salvando...' : category ? 'Cadastrar categoria' : 'Cadastrar local'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.teamNotice} role="status">{notice}</p>}
    <ul className={styles.catalogList} aria-label={category ? 'Categorias cadastradas' : 'Locais cadastrados'}>{items.map(item => <li key={item.id}>
      <div className={styles.catalogRow}><span>{item.name}</span><div className={styles.memberActions}>
        <button type="button" className={styles.removeMember} disabled={busy} aria-label={`Editar ${item.name}`} onClick={() => { setAction({ type: 'edit', item }); setError(''); setNotice(''); }}>Editar</button>
        <button type="button" className={styles.removeMember} disabled={busy} aria-label={`Excluir ${item.name}`} onClick={() => { setAction({ type: 'delete', item }); setError(''); setNotice(''); }}>Excluir</button>
      </div></div>
      {action?.item.id === item.id && <form key={`${item.id}-${action.type}`} className={formStyles.form} onSubmit={change} aria-busy={busy}>
        {action.type === 'edit' ? <><label className={formStyles.field} htmlFor={`edit-${kind}-${item.id}`}>Novo nome<input autoFocus className={formStyles.input} id={`edit-${kind}-${item.id}`} name="name" defaultValue={item.name} minLength={2} maxLength={120} required disabled={busy} /></label>
          <p className={styles.subtitle}>{category ? 'O novo nome também será exibido nos lançamentos e relatórios existentes.' : 'O novo nome será usado nas sugestões. Os lançamentos já salvos conservarão o local informado na época.'}</p></> : <p>Excluir “{item.name}”? {category ? 'Esta categoria deixará de estar disponível para novos lançamentos. Os gastos existentes e seus relatórios serão preservados.' : 'O local sairá das sugestões. Os locais informados nos lançamentos existentes serão preservados.'}</p>}
        <div className={styles.catalogRow}><button type="button" className={styles.removeMember} disabled={busy} onClick={() => setAction(null)}>Cancelar</button><button className={formStyles.button} disabled={busy}>{busy ? 'Salvando...' : action.type === 'edit' ? 'Salvar nome' : 'Confirmar exclusão'}</button></div>
      </form>}
    </li>)}</ul>
    {!items.length && <p className={styles.subtitle}>{category ? 'Nenhuma categoria ativa.' : 'Nenhum local cadastrado.'}</p>}
  </section>;
}
export default function CatalogPanel({ empresaId, categories, merchants }: { empresaId: string; categories: CategoryOption[]; merchants: MerchantOption[] }) {
  return <div className={styles.teamGrid}><CatalogSection empresaId={empresaId} kind="category" items={categories.filter(item => !item.archived).map(item => ({ id: item.id, name: item.label }))} /><CatalogSection empresaId={empresaId} kind="merchant" items={merchants} /></div>;
}
