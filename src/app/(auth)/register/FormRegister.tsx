'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import styles from '@/src/components/auth.module.css';

export default function FormCadastro() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || success) return;
    const data = new FormData(event.currentTarget);
    setLoading(true); setMessage('');
    try {
      await api.post('/auth/register', Object.fromEntries(data));
      setSuccess(true); setMessage('Conta e restaurante criados. Entre para continuar.');
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setLoading(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-busy={loading}>
    <label className={styles.field} htmlFor="nomeUsuario">Nome completo
      <input className={styles.input} id="nomeUsuario" name="nomeUsuario" autoComplete="name" minLength={2} maxLength={120} required disabled={success} />
    </label>
    <label className={styles.field} htmlFor="nomeEmpresa">Nome do restaurante
      <input className={styles.input} id="nomeEmpresa" name="nomeEmpresa" autoComplete="organization" minLength={2} maxLength={120} required disabled={success} />
    </label>
    <label className={styles.field} htmlFor="email">E-mail
      <input className={styles.input} id="email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={success} />
    </label>
    <label className={styles.field} htmlFor="senha">Senha
      <input className={styles.input} id="senha" name="senha" type="password" autoComplete="new-password" minLength={12} required disabled={success} aria-describedby="senha-hint" />
    </label>
    <p className={styles.hint} id="senha-hint">Use pelo menos 12 caracteres. Limite de 72 bytes (acentos e emojis podem ocupar mais de um byte).</p>
    <button className={styles.button} type="submit" disabled={loading || success}>{loading ? 'Criando conta...' : 'Criar conta'}</button>
    {message && <p className={success ? styles.success : styles.error} role={success ? 'status' : 'alert'}>{message}</p>}
    <p>Já possui conta? <Link href="/login">Entrar</Link></p>
  </form>;
}
