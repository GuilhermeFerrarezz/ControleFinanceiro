'use client';
import StockSetupFields, { stockSetupData } from '@/src/components/StockSetupFields';
import { newExpenseRequestId } from '@/src/lib/expense-shared';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/src/lib/api';
import { type CategoryOption } from '@/src/lib/expense-shared';
import { normalizeCatalogName, type CatalogKind, type ProductOption, type MerchantOption } from '@/src/lib/catalog-shared';
import styles from '../dashboard.module.css';
import ProductPackagingFields, { packagingFormData } from '@/src/components/ProductPackagingFields';
import formStyles from '@/src/components/auth.module.css';
function CatalogSection({ empresaId, kind, items, storageLocations = [] }: { empresaId: string; kind: CatalogKind; storageLocations?: MerchantOption[]; items: (MerchantOption & Partial<ProductOption>)[] }) {
  const stockRequest = useRef('');
  const [creationKey, setCreationKey] = useState(0);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<{ type: 'edit' | 'delete'; item: MerchantOption & Partial<ProductOption> } | null>(null);
  const router = useRouter();
  const category = kind === 'category';
  const product = kind === 'product';
  const storage = kind === 'storage';
  const filtered = items.filter(item => normalizeCatalogName(item.name).includes(normalizeCatalogName(query)));
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!action || busy) return;
    const fields = new FormData(event.currentTarget);
    const data = { empresaId, kind, id: action.item.id, previousName: action.item.name, name: fields.get('name'), confirm: true, ...(product && action.type === 'edit' ? { ...packagingFormData(fields), previousProduct: { defaultUnit: action.item.defaultUnit, packageContent: action.item.packageContent || null } } : {}) };
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
    const fields = new FormData(form);
    const name = fields.get('name');
    const packaging = packagingFormData(fields);
    if (!stockRequest.current) stockRequest.current = newExpenseRequestId();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.post<MerchantOption>('/catalog', { empresaId, kind, name, ...packaging, ...(product ? { ...stockSetupData(fields),requestId:stockRequest.current } : {}) });
      stockRequest.current = ''; form.reset(); setCreationKey(current => current + 1); setNotice(`“${response.data.name}” está disponível ${storage ? 'para o estoque' : 'para os lançamentos'}.`); router.refresh();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section className={`${styles.teamCard} ${styles.catalogCard}`}><h2>{category ? 'Categorias' : product ? 'Produtos e ingredientes' : storage ? 'Locais de armazenamento' : 'Locais / favorecidos'}</h2>
    <p className={`${styles.subtitle} ${styles.catalogIntro}`}>{category ? 'Cadastre, renomeie ou exclua categorias para organizar seus gastos.' : product ? 'Itens básicos já estão disponíveis. Cadastre ingredientes, produtos de limpeza e embalagens para toda a equipe.' : storage ? 'Cadastre despensas, câmaras frias e prateleiras para selecionar no estoque.' : 'Cadastre mercados, fornecedores e favorecidos para encontrá-los ao digitar um lançamento.'}</p>
    <form key={creationKey} className={`${formStyles.form} ${styles.catalogCreate}`} onSubmit={submit} aria-busy={busy}>
      <label className={formStyles.field} htmlFor={`catalog-${kind}`}>{category ? 'Nome da categoria' : product ? 'Nome do produto' : 'Nome do local'}<input id={`catalog-${kind}`} className={formStyles.input} name="name" minLength={2} maxLength={120} required disabled={busy} placeholder={category ? 'Ex.: Marketing' : product ? 'Ex.: Filé de tilápia' : storage ? 'Ex.: Câmara fria' : 'Ex.: Atacadão'} /></label>
      {product && <><ProductPackagingFields disabled={busy} /><StockSetupFields disabled={busy} empresaId={empresaId} storageLocations={storageLocations} onBusyChange={setBusy} /></>}
      <button className={formStyles.button} disabled={busy}>{busy ? 'Salvando...' : category ? 'Cadastrar categoria' : product ? 'Cadastrar produto' : 'Cadastrar local'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.teamNotice} role="status">{notice}</p>}
    <label className={`${formStyles.field} ${styles.catalogSearch}`} htmlFor={`catalog-search-${kind}`}>{category ? "Buscar categoria" : product ? "Buscar produto" : "Buscar local"}<input id={`catalog-search-${kind}`} className={formStyles.input} type="search" placeholder={category ? "Ex.: alimentos" : product ? "Ex.: arroz ou carne" : "Ex.: mercado"} value={query} onChange={event => setQuery(event.target.value)} /></label>
    <ul className={styles.catalogList} tabIndex={0} aria-label={category ? 'Categorias cadastradas' : product ? 'Produtos cadastrados' : 'Locais cadastrados'}>{filtered.map(item => <li key={item.id}>
      <div className={`${styles.catalogRow} ${styles.catalogItemRow}`}><span>{item.name}{product && item.packageContent && <small className={styles.catalogPackaging}>{item.packageContent.quantity.toLocaleString('pt-BR')} {item.packageContent.unit} por {item.defaultUnit}</small>}</span><div className={styles.memberActions}>
        <button type="button" className={`${styles.removeMember} ${styles.editButton}`} disabled={busy} aria-label={`Editar ${item.name}`} onClick={() => { setAction({ type: 'edit', item }); setError(''); setNotice(''); }}>Editar</button>
        <button type="button" className={styles.removeMember} disabled={busy} aria-label={`Excluir ${item.name}`} onClick={() => { setAction({ type: 'delete', item }); setError(''); setNotice(''); }}>Excluir</button>
      </div></div>
      {action?.item.id === item.id && <form key={`${item.id}-${action.type}`} className={formStyles.form} onSubmit={change} aria-busy={busy}>
        {action.type === 'edit' ? <><label className={formStyles.field} htmlFor={`edit-${kind}-${item.id}`}>Novo nome<input autoFocus className={formStyles.input} id={`edit-${kind}-${item.id}`} name="name" defaultValue={item.name} minLength={2} maxLength={120} required disabled={busy} /></label>
          {product && <ProductPackagingFields initialUnit={action.item.defaultUnit} content={action.item.packageContent} disabled={busy} />}
          <p className={styles.subtitle}>{category || product ? 'O nome será atualizado nos relatórios. Mudanças de embalagem valem para novas compras; as anteriores preservam o conteúdo informado.' : storage ? 'O novo nome será usado nas sugestões. Os produtos conservarão o local informado anteriormente até serem editados.' : 'O novo nome será usado nas sugestões. Os lançamentos já salvos conservarão o local informado na época.'}</p></> : <p>Excluir “{item.name}”? {product ? 'O produto sairá das sugestões. As compras e os gráficos existentes serão preservados.' : category ? 'Esta categoria deixará de estar disponível para novos lançamentos. Os gastos existentes e seus relatórios serão preservados.' : storage ? 'O local sairá das sugestões. Os locais já informados nos produtos serão preservados.' : 'O local sairá das sugestões. Os locais informados nos lançamentos existentes serão preservados.'}</p>}
        <div className={styles.catalogRow}><button type="button" className={styles.removeMember} disabled={busy} onClick={() => setAction(null)}>Cancelar</button><button className={formStyles.button} disabled={busy}>{busy ? 'Salvando...' : action.type === 'edit' ? 'Salvar nome' : 'Confirmar exclusão'}</button></div>
      </form>}
    </li>)}{!filtered.length && <li><span role="status">{query ? "Nenhum cadastro encontrado com essa busca." : "Nenhum cadastro disponível. Adicione o primeiro acima."}</span></li>}</ul>
  </section>;
}
export default function CatalogPanel({ empresaId, categories, merchants, products, storageLocations }: { empresaId: string; categories: CategoryOption[]; merchants: MerchantOption[]; products: ProductOption[]; storageLocations: MerchantOption[] }) {
  return <div className={styles.catalogGrid}><CatalogSection empresaId={empresaId} kind="category" items={categories.filter(item => !item.archived).map(item => ({ id: item.id, name: item.label }))} /><CatalogSection empresaId={empresaId} kind="merchant" items={merchants} /><CatalogSection empresaId={empresaId} kind="storage" items={storageLocations} /><CatalogSection empresaId={empresaId} storageLocations={storageLocations} kind="product" items={products.filter(item => !item.archived)} /></div>;
}
