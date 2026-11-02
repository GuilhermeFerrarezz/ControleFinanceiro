import { redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { findEmpresa } from '@/src/models/Empresa';
import Header from '@/src/components/cabecalho/page';
import FinanceNav from '@/src/components/FinanceNav';
import RestaurantForm from './RestaurantForm';
import styles from '../dashboard.module.css';

export const metadata = { title: 'Restaurante | Controle Financeiro' };
export default async function RestaurantPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  const restaurant = await findEmpresa(user.empresaId);
  if (!restaurant) redirect('/home');
  return <><Header nome={restaurant.nome} user={user} /><main className={styles.main}>
    <FinanceNav active="restaurant" />
    <div className={styles.heading}><div><span className="eyebrow">Minha casa</span><h1 className="serif">Dados do restaurante</h1><p>Gerencie o cadastro de {restaurant.nome}.</p></div></div>
    {user.role === 'owner' ? <RestaurantForm key={restaurant.id} restaurant={restaurant} /> : <section className={styles.teamCard}><h2>{restaurant.nome}</h2><p>CNPJ: {restaurant.cnpj || 'Não informado'}</p><p>Somente o admin pode editar os dados ou excluir o restaurante.</p></section>}
  </main></>;
}
