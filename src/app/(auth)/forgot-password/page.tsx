import AuthShell from '@/src/components/AuthShell';
import AccountRecoveryForm from '@/src/components/AccountRecoveryForm';
export const metadata = { title: 'Recuperar acesso | Saldo da Casa', robots: { index: false, follow: false } };
export default function ForgotPasswordPage() {
  return <AuthShell><AccountRecoveryForm mode="forgot" /></AuthShell>;
}
