import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { platformOverview } from '@/src/models/Platform';
import Header from '@/src/components/cabecalho/page';
import AdminPanel from './AdminPanel';
export const metadata = {title:'Administração da plataforma | Saldo da Casa',robots:{index:false,follow:false}};
export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect('/login?next=/admin');
  if (user.platformRole !== 'ADMIN') notFound();
  const data = await platformOverview('',1);
  return <><Header nome="Administração da plataforma" user={user}/><AdminPanel initialData={data} adminId={user.id}/></>;
}
