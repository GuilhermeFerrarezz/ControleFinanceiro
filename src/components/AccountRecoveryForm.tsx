'use client';
import { MIN_PASSWORD_LENGTH } from '@/src/lib/password-policy';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api, clearLegacyAuth, errorMessage } from '../lib/api';
import PasswordInput from './PasswordInput';
import styles from './auth.module.css';
import {resolveAuthLinkToken} from '../lib/auth-link';

export default function AccountRecoveryForm({ mode, token: initialToken = '', verificationExpired = false }: { mode: 'verify' | 'forgot' | 'reset'; token?: string; verificationExpired?: boolean }) {
  const [token,setToken]=useState(initialToken);
  const [ready,setReady]=useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  useEffect(()=>{
    function readLink() {
      const hash=window.location.hash;
      // React Strict Mode replays effects in development. Once the URL is
      // scrubbed, that replay must retain the token already held in memory.
      setToken(current=>resolveAuthLinkToken(hash,initialToken,current));
      setSuccess(false);setMessage('');setReady(true);
      if (window.location.hash || new URLSearchParams(window.location.search).has('token')) window.history.replaceState(null,'',window.location.pathname);
    }
    readLink();window.addEventListener('hashchange',readLink);
    return ()=>window.removeEventListener('hashchange',readLink);
  },[initialToken]);
  const hasToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  const requesting = mode === 'forgot' || (mode === 'verify' && !hasToken);
  const title = mode === 'forgot' ? 'Vamos recuperar seu acesso.' : mode === 'reset' ? 'Uma nova senha para sua conta.' : 'Confirme seu e-mail.';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || loading || success) return;
    const data = new FormData(event.currentTarget);
    if (mode === 'reset' && data.get('senha') !== data.get('confirmacao')) { setMessage('As senhas precisam ser iguais.'); return; }
    setLoading(true); setMessage('');
    try {
      const path = mode === 'forgot' ? 'forgot-password' : mode === 'reset' ? 'reset-password' : requesting ? 'resend-verification' : 'verify-email';
      const response = await api.post(`/auth/${path}`, requesting ? { email: data.get('email') } : mode === 'reset' ? { token, senha: data.get('senha') } : {token}, { timeout: 20000 });
      setSuccess(true); setMessage(response.data.message);
      if (mode === 'reset') clearLegacyAuth();
      if (!requesting) window.history.replaceState(null, '', window.location.pathname);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setLoading(false); }
  }
  if (!ready) return <p className={styles.intro} role="status">Preparando seu acesso...</p>;
  return <><span className="eyebrow">Cuidado com seu acesso</span><h1>{title}</h1>
    {mode === 'verify' && verificationExpired && !hasToken && <p className={styles.ownerNote}>O prazo de 7 dias após o cadastro terminou. Confirme seu e-mail para voltar a acessar o sistema. Solicite um novo link abaixo.</p>}
    <p className={styles.intro}>{mode === 'forgot' ? 'Informe seu e-mail para receber um link válido por 30 minutos.' : mode === 'reset' ? 'Escolha uma senha que você não usa em outros sites.' : hasToken ? 'Confirme abaixo para verificar o endereço da sua conta.' : 'Informe seu e-mail para receber um novo link de confirmação, válido por 24 horas.'}</p>
    {mode === 'reset' && !hasToken ? <p className={styles.error} role="alert">Link inválido ou ausente. <Link href="/forgot-password">Solicitar um novo link</Link></p> :
      <form className={styles.form} onSubmit={submit} aria-busy={loading}>
        {requesting && <label className={styles.field} htmlFor="email">Seu e-mail<input className={styles.input} id="email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={success} /></label>}
        {mode === 'reset' && <><div className={styles.field}><label htmlFor="senha">Nova senha</label><PasswordInput registration disabled={success} /></div><label className={styles.field} htmlFor="confirmacao">Confirme a nova senha<input className={styles.input} id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required disabled={success} /></label></>}
        <button className={styles.button} disabled={loading || success} type="submit">{loading ? 'Aguarde...' : requesting ? 'Enviar instruções' : mode === 'reset' ? 'Salvar nova senha' : 'Confirmar meu e-mail'}</button>
        {message && <p className={success ? styles.success : styles.error} role={success ? 'status' : 'alert'}>{message}</p>}
      </form>}
    <p className={styles.recoveryLinks}><Link href="/login">Voltar para entrar</Link>{mode === 'verify' && hasToken && !success && <Link href="/verify-email">Solicitar novo link</Link>}{mode === 'reset' && hasToken && !success && <Link href="/forgot-password">Solicitar novo link</Link>}</p>
  </>;
}
