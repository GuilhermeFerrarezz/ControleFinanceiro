import FinancePage from '@/src/components/FinancePage';
export const metadata = { title: 'Visão geral | Saldo da Casa' };
export default function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinancePage view="overview" searchParams={searchParams} />;
}
