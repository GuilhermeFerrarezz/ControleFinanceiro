import AuthShell from '@/src/components/AuthShell';
import FormLogin from './FormLogin';
import { inviteDestination } from '@/src/lib/restaurants';
export const metadata = { title: 'Entrar | Saldo da Casa' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = inviteDestination((await searchParams).next);
  return <AuthShell registerHref={next.startsWith('/invite/') ? `/register?invite=${next.slice(8)}` : '/register'}><FormLogin next={next} /></AuthShell>;
}
