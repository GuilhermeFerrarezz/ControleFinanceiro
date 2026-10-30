'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import Icon from '@/src/components/Icon';
import PasswordInput from '@/src/components/PasswordInput';
import styles from '@/src/components/auth.module.css';
export default function FormCadastro({ invitation }: { invitation?: { token: string; email: string; restaurante: string } }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading || success) return;
    const data = new FormData(event.currentTarget);
    setLoading(true); setMessage('');
    try {
      await api.post('/auth/register', { ...Object.fromEntries(data), ...(invitation ? { invitationToken: invitation.token } : {}) });
      setSuccess(true); setMessage(invitation ? 'Sua conta está pronta e o convite foi aceito. Entre para encontrar sua equipe.' : 'Seu restaurante já tem um lugar aqui. Entre e convide sua equipe!');
    } catch (error) { setMessage(errorMessage(error)); } finally { setLoading(false); }
  }
  return <><span className="eyebrow">{invitation ? 'Tem lugar para você na equipe' : 'Um novo capítulo para o seu restaurante'}</span><h1>{invitation ? <>Faça parte<br />da mesma receita.</> : <>Sua casa.<br />Mais organizada.</>}</h1><p className={styles.intro}>{invitation ? `Crie seu acesso pessoal para participar de ${invitation.restaurante}.` : 'Crie sua conta como dono. Depois, convide os funcionários que fazem tudo acontecer com você.'}</p><div className={styles.ownerNote}><Icon name={invitation ? 'team' : 'store'} /><div><strong>{invitation ? `Convite para ${invitation.restaurante}` : 'Você no comando, sua equipe junto.'}</strong>{invitation ? 'Você entrará como funcionário deste restaurante.' : 'Só você administra os convites e os acessos do restaurante.'}</div></div>
    <form className={styles.form} onSubmit={submit} aria-busy={loading}>
      <label className={styles.field} htmlFor="nomeUsuario">Seu nome<input className={styles.input} id="nomeUsuario" name="nomeUsuario" autoComplete="name" placeholder="Como podemos chamar você?" minLength={2} maxLength={120} required disabled={success} /></label>
      {!invitation && <label className={styles.field} htmlFor="nomeEmpresa">Nome do restaurante<input className={styles.input} id="nomeEmpresa" name="nomeEmpresa" autoComplete="organization" placeholder="O nome da sua casa" minLength={2} maxLength={120} required disabled={success} /></label>}
      <label className={styles.field} htmlFor="email">Seu e-mail<input className={styles.input} id="email" name="email" type="email" autoComplete="username" placeholder="voce@restaurante.com.br" defaultValue={invitation?.email} readOnly={!!invitation} maxLength={254} required disabled={success} /></label>
      <div className={styles.field}><label htmlFor="senha">Crie sua senha</label><PasswordInput registration disabled={success} /></div><p className={styles.hint} id="senha-hint">Use 6 ou mais caracteres. Prefira uma senha que você não usa em outros sites.</p>
      <button className={styles.button} type="submit" disabled={loading || success}>{loading ? 'Preparando sua conta...' : invitation ? 'Criar conta e aceitar convite' : 'Criar meu restaurante'}<Icon name="arrow" size={18} /></button>
      {message && <div className={success ? styles.success : styles.error} role={success ? 'status' : 'alert'}>{message}{success && <p><Link className="button" href="/login">Entrar na minha conta <Icon name="arrow" size={16} /></Link></p>}</div>}
      {!success && <p className={styles.formBottom}>Já recebeu um convite? Use o link enviado pelo dono.</p>}
    </form></>;
}
