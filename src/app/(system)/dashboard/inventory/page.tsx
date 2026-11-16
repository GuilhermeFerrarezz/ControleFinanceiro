import { redirect } from 'next/navigation';
import { currentUser } from '@/src/lib/auth';
import { inventoryData } from '@/src/lib/inventory';
import { listProducts, listStorageLocations } from '@/src/models/Catalog';
import Header from '@/src/components/cabecalho/page';
import FinanceNav from '@/src/components/FinanceNav';
import InventoryPanel from '@/src/components/InventoryPanel';
import styles from '@/src/components/finance.module.css';

export const metadata = { title:'Estoque | Saldo da Casa' };
export default async function InventoryPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.empresaId) redirect('/home');
  const [storageLocations, initialData, catalog] = await Promise.all([
    listStorageLocations(user.empresaId), inventoryData(user.empresaId), listProducts(user.empresaId),
  ]);
  return <><Header nome={user.empresaNome || 'Restaurante'} user={user} /><main className={styles.main}>
    <FinanceNav active="inventory" />
    <InventoryPanel key={user.empresaId} empresaId={user.empresaId} storageLocations={storageLocations} initialData={initialData} catalog={catalog} />
  </main></>;
}
