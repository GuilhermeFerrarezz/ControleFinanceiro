import AuthShell from '@/src/components/AuthShell';
import AccountRecoveryForm from '@/src/components/AccountRecoveryForm';
export const metadata = { title: 'Confirmar e-mail | Saldo da Casa', robots: { index: false, follow: false } };
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string | string[]; reason?: string }> }) {
  const { token, reason } = await searchParams;
  return <AuthShell><AccountRecoveryForm mode="verify" token={typeof token === 'string' ? token : ''} verificationExpired={reason === 'expired'} /></AuthShell>;
}
