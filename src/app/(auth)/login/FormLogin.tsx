'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, clearLegacyAuth, errorMessage } from '@/src/lib/api';
import Icon from '@/src/components/Icon';
import PasswordInput from '@/src/components/PasswordInput';
import styles from '@/src/components/auth.module.css';
export default function FormLogin({ next = '/dashboard' }: { next?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading) return;
    const data = new FormData(event.currentTarget);
    setLoading(true); setMessage('');
    try {
      await api.post('/auth/login', { email: data.get('email'), senha: data.get('senha'), remember: data.get('remember') === 'on' });
      clearLegacyAuth(); router.replace(next); router.refresh();
    } catch (error) { setMessage(errorMessage(error)); setLoading(false); }
  }
  return <><span className="eyebrow">Bom ter você de volta</span><h1>Vamos cuidar<br />do seu negócio?</h1><p className={styles.intro}>{next.startsWith('/invite/') ? 'Entre com o e-mail do convite para fazer parte da equipe.' : 'Entre na sua conta e encontre seu restaurante e sua equipe no mesmo lugar.'}</p><form className={styles.form} onSubmit={submit} aria-busy={loading}>
    <label className={styles.field} htmlFor="email">Seu e-mail<input className={styles.input} id="email" name="email" type="email" autoComplete="username" placeholder="voce@restaurante.com.br" maxLength={254} required /></label>
    <div className={styles.field}><label htmlFor="senha">Sua senha</label><PasswordInput /></div>
    <label className={styles.checkbox}><input name="remember" type="checkbox" />Manter conectado por 7 dias</label>
    <button className={styles.button} type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar na minha conta'}<Icon name="arrow" size={18} /></button>
    {message && <p className={styles.error} role="alert">{message}</p>}
    <p className={styles.formBottom}>É novo por aqui? <Link href={next.startsWith('/invite/') ? `/register?invite=${next.slice(8)}` : '/register'}>Criar minha conta</Link></p>
  </form></>;
}
