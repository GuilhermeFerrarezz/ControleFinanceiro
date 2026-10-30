import FinancePage from '@/src/components/FinancePage';
export const metadata = { title: 'Visão geral | Controle Financeiro' };
export default function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinancePage view="overview" searchParams={searchParams} />;
}
