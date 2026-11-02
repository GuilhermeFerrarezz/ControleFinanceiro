import { redirect } from 'next/navigation';
import Header from '@/src/components/cabecalho/page';
import Icon from '@/src/components/Icon';
import FinanceNav from '@/src/components/FinanceNav';
import { currentUser } from '@/src/lib/auth';
import { userRestaurants } from '@/src/lib/restaurants';
import { listTeam } from '@/src/models/Membership';
import { listInvitations } from '@/src/models/Invitation';
import TeamPanel from '../TeamPanel';
import RestaurantSwitcher from '../RestaurantSwitcher';
import styles from '../dashboard.module.css';
export const metadata = { title: 'Minha equipe | Saldo da Casa' };
export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  const restaurants = await userRestaurants(user.id);
  const members = user.role === 'owner' ? await listTeam(user.empresaId) : [];
  const invitations = user.role === 'owner' ? await listInvitations(user.empresaId) : [];
  return <><Header nome={user.empresaNome || 'Restaurante'} user={user} /><main className={styles.main}><FinanceNav active="team" /><div className={styles.breadcrumb}>Meu restaurante <span>/</span> {user.role === 'owner' ? 'Equipe e acessos' : 'Meu acesso'}</div><div className={styles.heading}><div><span className="eyebrow">Tudo começa com as pessoas</span><h1 className="serif">A casa é de vocês.</h1><p>{user.role === 'owner' ? 'Prepare sua equipe para uma rotina mais organizada.' : `Você faz parte de ${user.empresaNome}. Bom ter você na equipe.`}</p></div><RestaurantSwitcher restaurants={restaurants} selected={user.empresaId} /></div><section className={styles.welcome}><span className={styles.welcomeIcon}><Icon name="store" size={32} /></span><div><span className={styles.smallLabel}>SEU RESTAURANTE</span><h2>{user.empresaNome}</h2><p>{user.role === 'owner' ? 'Você administra esta casa e os convites da equipe.' : 'Seu acesso como funcionário está ativo.'}</p></div><span className={styles.badge}>{user.role === 'owner' ? 'Dono' : 'Funcionário'}</span></section>{user.role === 'owner' ? <TeamPanel members={members} invitations={invitations.map(invitation => ({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt.toISOString() }))} /> : <section className={styles.employeeCard}><Icon name="shield" size={30} /><h2>Seu lugar na equipe está pronto.</h2><p>Você tem uma conta pessoal vinculada ao restaurante. O dono cuida da administração e dos convites.</p></section>}</main></>;
}
