import { redirect } from 'next/navigation';
import Header from '@/src/components/cabecalho/page';
import { currentUser } from '@/src/lib/auth';
import CompanyForm from './CompanyForm';
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (user.empresaId) redirect('/dashboard');
  return <><Header nome="Configurar restaurante" user={user} /><main style={{ padding: '55px 24px', maxWidth: 480, width: '100%', margin: 'auto' }}><CompanyForm /></main></>;
}
