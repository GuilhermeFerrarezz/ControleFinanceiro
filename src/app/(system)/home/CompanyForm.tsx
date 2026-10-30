'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/src/lib/api';
import styles from '@/src/components/auth.module.css';
export default function CompanyForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading) return;
    const data = new FormData(event.currentTarget);
    setLoading(true); setMessage('');
    try { await api.post('/company', { nomeEmpresa: data.get('nomeEmpresa') }); router.replace('/dashboard'); router.refresh(); }
    catch (error) { setMessage(errorMessage(error)); setLoading(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-busy={loading}>
    <h1>Cadastre seu restaurante</h1><p>Vincule sua conta a um restaurante para continuar.</p>
    <label className={styles.field} htmlFor="nomeEmpresa">Nome do restaurante<input className={styles.input} id="nomeEmpresa" name="nomeEmpresa" minLength={2} maxLength={120} required /></label>
    <button className={styles.button} disabled={loading}>{loading ? 'Salvando...' : 'Continuar'}</button>
    {message && <p className={styles.error} role="alert">{message}</p>}
  </form>;
}
