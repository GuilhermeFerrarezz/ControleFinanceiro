'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '../lib/api';
import Icon from './Icon';
import styles from './auth.module.css';

export default function EmailConfirmationNotice({ email }: { email: string }) {
  const [remaining, setRemaining] = useState(60);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  async function resend() {
    if (loading || remaining) return;
    setLoading(true); setMessage(''); setError(false);
    try {
      const response = await api.post('/auth/resend-verification', { email }, { timeout: 20000 });
      setMessage(response.data.message); setRemaining(60);
    } catch (cause) { setMessage(errorMessage(cause)); setError(true); }
    finally { setLoading(false); }
  }
  return <div className={styles.confirmation}>
    <div className={styles.confirmationIcon}><Icon name="shield" size={32} /></div>
    <span className="eyebrow">Confira sua caixa de entrada</span>
    <h1>Verifique seu e-mail</h1>
    <p className={styles.intro}>Se o cadastro puder ser concluído, enviaremos um link para<strong className={styles.confirmationEmail}>{email}</strong></p>
    <p className={styles.confirmationHelp}>Abra sua caixa de entrada e clique em <strong>Confirmar meu e-mail</strong>. O link é válido por 24 horas. Confira também o spam. Se já possui uma conta, entre ou recupere sua senha. Caso não receba o link, contate o administrador.</p>
    <button className={styles.button} type="button" onClick={resend} disabled={loading || remaining > 0}>{loading ? 'Solicitando...' : remaining > 0 ? `Reenviar link em ${remaining}s` : 'Reenviar e-mail de confirmação'}</button>
    {message && <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>{message}</p>}
    <p className={styles.recoveryLinks}><Link href="/login">Já confirmei meu e-mail. Entrar</Link></p>
    <p className={styles.recoveryLinks}><Link href="/forgot-password">Recuperar minha senha</Link></p>
  </div>;
}
