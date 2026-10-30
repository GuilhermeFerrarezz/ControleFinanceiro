'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, clearLegacyAuth, errorMessage } from '@/src/lib/api';
import styles from '@/src/components/auth.module.css';

export default function FormLogin() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const data = new FormData(event.currentTarget);
    setLoading(true); setMessage('');
    try {
      await api.post('/auth/login', { email: data.get('email'), senha: data.get('senha'), remember: data.get('remember') === 'on' });
      clearLegacyAuth();
      router.replace('/dashboard'); router.refresh();
    } catch (error) { setMessage(errorMessage(error)); setLoading(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-busy={loading}>
    <label className={styles.field} htmlFor="email">E-mail
      <input className={styles.input} id="email" name="email" type="email" autoComplete="username" maxLength={254} required />
    </label>
    <label className={styles.field} htmlFor="senha">Senha
      <input className={styles.input} id="senha" name="senha" type="password" autoComplete="current-password" required />
    </label>
    <label className={styles.checkbox}><input name="remember" type="checkbox" />Lembre-me por 7 dias</label>
    <button className={styles.button} type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
    {message && <p className={styles.error} role="alert">{message}</p>}
    <p>Não tem uma conta? <Link href="/register">Criar conta</Link></p>
  </form>;
}
