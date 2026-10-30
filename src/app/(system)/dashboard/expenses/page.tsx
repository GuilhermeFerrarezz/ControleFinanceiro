import FinancePage from '@/src/components/FinancePage';
export const metadata = { title: 'Lançamentos | Controle Financeiro' };
export default function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FinancePage view="expenses" searchParams={searchParams} />;
}
