import Link from 'next/link';
import AuthShell from '@/src/components/AuthShell';
import { validInvitation } from '@/src/lib/invitations';
import { currentUser } from '@/src/lib/auth';
import AcceptInvitation from './AcceptInvitation';
import styles from '@/src/components/auth.module.css';
export const metadata = { title: 'Convite para a equipe | Controle Financeiro', robots: { index: false, follow: false } };
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await validInvitation(token);
  if (!valid) return <AuthShell mode="invite"><span className="eyebrow">Convite indisponível</span><h1>Uma nova chance<br />de entrar na equipe.</h1><p className={styles.intro}>Este convite expirou, foi revogado ou já foi utilizado. Peça um novo link ao dono do restaurante.</p><Link className="button" href="/login">Entrar na minha conta</Link></AuthShell>;
  const user = await currentUser();
  const next = `/invite/${token}`;
  const login = `/login?next=${encodeURIComponent(next)}`;
  const register = `/register?invite=${token}`;
  const email = valid.invitation.email;
  return <AuthShell mode="invite" loginHref={login} registerHref={register}><span className="eyebrow">Um convite para fazer parte</span><h1>Sua equipe<br />está esperando.</h1><p className={styles.intro}>Você foi convidado para participar de <strong>{valid.empresa.nome}</strong> como funcionário.</p><div className={styles.ownerNote}><span>Convite pessoal para <strong>{email}</strong>Válido por 7 dias a partir da criação.</span></div>{user ? user.email === email ? <AcceptInvitation token={token} /> : <><p className={styles.error}>Você está conectado como {user.email}. Este convite pertence a outro e-mail.</p><p className={styles.intro}>Saia da conta atual pelo painel e entre com o e-mail indicado no convite.</p><Link className="button" href="/dashboard">Ir ao meu painel</Link></> : <div className={styles.form}><Link className="button" href={register}>Criar minha conta e participar</Link><Link className="button button-outline" href={login}>Já tenho conta. Entrar</Link></div>}</AuthShell>;
}
