'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '../lib/api';
import Icon from './Icon';
import styles from './auth.module.css';

export default function EmailConfirmationNotice({ email, delivery }: { email: string; delivery: 'sent' | 'development' | 'unavailable' }) {
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
    <span className="eyebrow">Conta criada com sucesso</span>
    <h1>Verifique seu e-mail</h1>
    <p className={styles.intro}>{delivery === 'sent' ? 'Enviamos um link de confirmação para' : 'Confirme o endereço da sua conta:'}<strong className={styles.confirmationEmail}>{email}</strong></p>
    {delivery === 'development' ? <p className={styles.ownerNote}>Modo de desenvolvimento: nenhum e-mail foi enviado. Abra o link de confirmação exibido no terminal do servidor.</p> : delivery === 'unavailable' ? <p className={styles.error} role="status">Sua conta está salva, mas não conseguimos enviar o e-mail agora. Aguarde um minuto e solicite um novo link.</p> : <p className={styles.confirmationHelp}>Abra sua caixa de entrada e clique em <strong>Confirmar meu e-mail</strong>. O link é válido por 24 horas. Se não encontrar a mensagem, confira o spam e a pasta de promoções.</p>}
    <button className={styles.button} type="button" onClick={resend} disabled={loading || remaining > 0}>{loading ? 'Solicitando...' : remaining > 0 ? `Reenviar link em ${remaining}s` : 'Reenviar e-mail de confirmação'}</button>
    {message && <p className={error ? styles.error : styles.success} role={error ? 'alert' : 'status'}>{message}</p>}
    <p className={styles.recoveryLinks}><Link href="/login">Já confirmei meu e-mail. Entrar</Link></p>
  </div>;
}
