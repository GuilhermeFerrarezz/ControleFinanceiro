import { redirect } from 'next/navigation';
import { Op } from 'sequelize';
import Header from '@/src/components/cabecalho/page';
import Icon from '@/src/components/Icon';
import FinanceNav from '@/src/components/FinanceNav';
import { currentUser } from '@/src/lib/auth';
import { userRestaurants } from '@/src/lib/restaurants';
import { Membership } from '@/src/models/Membership';
import { Usuario } from '@/src/models/Usuario';
import { Invitation } from '@/src/models/Invitation';
import TeamPanel from '../TeamPanel';
import RestaurantSwitcher from '../RestaurantSwitcher';
import styles from '../dashboard.module.css';
export const metadata = { title: 'Minha equipe | Controle Financeiro' };
export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  const restaurants = await userRestaurants(user.id);
  const memberships = await Membership.findAll({ where: { empresaId: user.empresaId }, order: [['createdAt', 'ASC']] });
  // Employee profiles are only loaded for the owner's team administration screen.
  const members = user.role === 'owner' ? await Promise.all(memberships.map(async membership => {
    const member = await Usuario.findByPk(membership.get('userId') as string, { attributes: ['nome', 'email'] });
    return { id: membership.get('id') as string, nome: member?.get('nome') as string, email: member?.get('email') as string, role: membership.get('role') as string };
  })) : [];
  const invitations = user.role === 'owner' ? await Invitation.findAll({ where: { empresaId: user.empresaId, acceptedAt: null, revokedAt: null, expiresAt: { [Op.gt]: new Date() } }, order: [['createdAt', 'DESC']] }) : [];
  return <><Header nome={user.empresaNome || 'Restaurante'} user={user} /><main className={styles.main}><FinanceNav active="team" /><div className={styles.breadcrumb}>Meu restaurante <span>/</span> {user.role === 'owner' ? 'Equipe e acessos' : 'Meu acesso'}</div><div className={styles.heading}><div><span className="eyebrow">Tudo começa com as pessoas</span><h1 className="serif">A casa é de vocês.</h1><p>{user.role === 'owner' ? 'Prepare sua equipe para uma rotina mais organizada.' : `Você faz parte de ${user.empresaNome}. Bom ter você na equipe.`}</p></div><RestaurantSwitcher restaurants={restaurants} selected={user.empresaId} /></div><section className={styles.welcome}><span className={styles.welcomeIcon}><Icon name="store" size={32} /></span><div><span className={styles.smallLabel}>SEU RESTAURANTE</span><h2>{user.empresaNome}</h2><p>{user.role === 'owner' ? 'Você administra esta casa e os convites da equipe.' : 'Seu acesso como funcionário está ativo.'}</p></div><span className={styles.badge}>{user.role === 'owner' ? 'Dono' : 'Funcionário'}</span></section>{user.role === 'owner' ? <TeamPanel members={members} invitations={invitations.map(invitation => ({ id: invitation.get('id') as string, email: invitation.get('email') as string, expiresAt: (invitation.get('expiresAt') as Date).toISOString() }))} /> : <section className={styles.employeeCard}><Icon name="shield" size={30} /><h2>Seu lugar na equipe está pronto.</h2><p>Você tem uma conta pessoal vinculada ao restaurante. O dono cuida da administração e dos convites.</p></section>}</main></>;
}
