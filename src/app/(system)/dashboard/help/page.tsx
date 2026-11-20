import { redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { userRestaurants } from '@/src/lib/restaurants';
import Header from '@/src/components/cabecalho/page';
import FinanceNav from '@/src/components/FinanceNav';
import HelpCenter from '@/src/components/HelpCenter';
import RestaurantSwitcher from '../RestaurantSwitcher';
import styles from '@/src/components/finance.module.css';

export const metadata = { title: 'Ajuda | Saldo da Casa' };

export default async function HelpPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  return <>
    <Header nome={user.empresaNome || 'Meu restaurante'} user={user} />
    <main className={styles.main}>
      <FinanceNav active="help" />
      <div className={styles.heading}>
        <div><span className="eyebrow">Uma orientação para cada etapa</span><h1>Como podemos ajudar?</h1>
          <p>Aprenda a registrar, conferir e entender os números do seu restaurante.</p></div>
        <RestaurantSwitcher restaurants={await userRestaurants(user.id)} selected={user.empresaId} />
      </div>
      <HelpCenter role={user.role === 'owner' ? 'owner' : 'employee'} platformAdmin={user.platformAdmin} />
    </main>
  </>;
}
