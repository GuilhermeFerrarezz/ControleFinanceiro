import { redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { listCategories, listMerchants } from '@/src/models/Catalog';
import Header from '@/src/components/cabecalho/page';
import FinanceNav from '@/src/components/FinanceNav';
import CatalogPanel from './CatalogPanel';
import styles from '../dashboard.module.css';
export const metadata = { title: 'Categorias e locais | Saldo da Casa' };
export default async function CatalogPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  return <><Header nome={user.empresaNome || 'Restaurante'} user={user} /><main className={styles.main}>
    <FinanceNav active="catalog" /><div className={styles.heading}><div><span className="eyebrow">Tudo no seu lugar</span><h1 className="serif">Categorias e locais</h1><p>Cadastros compartilhados pela equipe de {user.empresaNome}.</p></div></div>
    <CatalogPanel key={user.empresaId} empresaId={user.empresaId} categories={await listCategories(user.empresaId)} merchants={await listMerchants(user.empresaId)} />
  </main></>;
}
