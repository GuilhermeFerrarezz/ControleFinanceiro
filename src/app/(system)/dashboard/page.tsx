import { redirect } from 'next/navigation';
import Header from '@/src/components/cabecalho/page';
import { currentUser } from '@/src/lib/auth';
export default async function Dashboard() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  return <><Header nome={user.empresaNome || 'Restaurante'} user={user} /><main style={{ padding: 24 }}><h1>Painel financeiro</h1><p>Bem-vindo, {user.nome}. As funcionalidades financeiras estão em desenvolvimento.</p></main></>;
}
