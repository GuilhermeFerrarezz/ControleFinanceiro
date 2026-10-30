import Link from 'next/link';
import AuthShell from '@/src/components/AuthShell';
import { validInvitation } from '@/src/lib/invitations';
import FormCadastro from './FormRegister';
export const metadata = { title: 'Criar conta | Controle Financeiro', robots: { index: false, follow: false } };
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const valid = invite ? await validInvitation(invite) : null;
  if (invite && !valid) return <AuthShell mode="invite"><span className="eyebrow">Convite indisponível</span><h1>Vamos pedir<br />um novo convite?</h1><p>Este link expirou, foi revogado ou já foi utilizado. Peça um novo convite ao dono do restaurante.</p><Link className="button" href="/login">Entrar na minha conta</Link></AuthShell>;
  return <AuthShell mode="register" loginHref={invite ? `/login?next=${encodeURIComponent(`/invite/${invite}`)}` : "/login"}><FormCadastro invitation={valid && invite ? { token: invite, email: valid.invitation.email, restaurante: valid.empresa.nome } : undefined} /></AuthShell>;
}
