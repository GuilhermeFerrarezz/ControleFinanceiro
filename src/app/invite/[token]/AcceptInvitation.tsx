'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import Icon from '@/src/components/Icon';
import styles from '@/src/components/auth.module.css';
export default function AcceptInvitation({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  async function accept() {
    if (loading) return;
    setLoading(true); setMessage('');
    try { await api.post('/invitations/accept', { token }); router.replace('/dashboard'); router.refresh(); }
    catch (error) { setMessage(errorMessage(error)); setLoading(false); }
  }
  return <div className={styles.form}><button className={styles.button} disabled={loading} onClick={accept}>{loading ? 'Entrando na equipe...' : 'Aceitar convite e participar'}<Icon name="arrow" size={18} /></button>{message && <p className={styles.error} role="alert">{message}</p>}</div>;
}
