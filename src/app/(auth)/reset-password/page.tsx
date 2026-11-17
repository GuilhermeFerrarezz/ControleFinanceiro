import AuthShell from '@/src/components/AuthShell';
import AccountRecoveryForm from '@/src/components/AccountRecoveryForm';
export const metadata = { title: 'Redefinir senha | Saldo da Casa', robots: { index: false, follow: false } };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <AuthShell><AccountRecoveryForm mode="reset" token={typeof token === 'string' ? token : ''} /></AuthShell>;
}
