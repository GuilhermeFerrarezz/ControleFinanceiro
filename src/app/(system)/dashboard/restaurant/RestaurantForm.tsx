'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/src/lib/api';
import PasswordInput from '@/src/components/PasswordInput';
import styles from '../dashboard.module.css';
import formStyles from '@/src/components/auth.module.css';

export default function RestaurantForm({ restaurant }: { restaurant: { id: string; nome: string; cnpj: string | null } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>, deleting: boolean) {
    event.preventDefault();
    if (loading) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true); setError(''); setNotice('');
    try {
      if (deleting) {
        await api.delete('/company', { data: { empresaId: restaurant.id, senha: data.get('senha') } });
        router.replace('/dashboard'); router.refresh();
      } else {
        await api.patch('/company', { empresaId: restaurant.id, nomeEmpresa: data.get('nomeEmpresa'), cnpj: data.get('cnpj') });
        setNotice('Dados do restaurante atualizados.'); router.refresh();
      }
    } catch (err) { setError(errorMessage(err)); }
    finally { if (deleting) form.reset(); setLoading(false); }
  }
  return <div className={styles.teamGrid}>
    <section className={styles.teamCard}><h2>Editar dados</h2>
      <form className={formStyles.form} onSubmit={event => submit(event, false)} aria-busy={loading}>
        <label className={formStyles.field} htmlFor="nomeEmpresa">Nome do restaurante<input className={formStyles.input} id="nomeEmpresa" name="nomeEmpresa" defaultValue={restaurant.nome} minLength={2} maxLength={120} required disabled={loading} /></label>
        <label className={formStyles.field} htmlFor="cnpj">CNPJ (opcional)<input className={formStyles.input} id="cnpj" name="cnpj" defaultValue={restaurant.cnpj || ''} maxLength={18} placeholder="00.000.000/0000-00" disabled={loading} /></label>
        <button className={formStyles.button} disabled={loading}>{loading ? 'Aguarde...' : 'Salvar alterações'}</button>
      </form>
      {notice && <p className={styles.teamNotice} role="status">{notice}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
    <section className={styles.teamCard}><h2>Excluir restaurante</h2>
      <p className={styles.subtitle}>A exclusão é permanente: remove todos os lançamentos, histórico financeiro, convites e vínculos da equipe deste restaurante. As contas dos usuários são preservadas.</p>
      {confirming ? <form className={formStyles.form} onSubmit={event => submit(event, true)} aria-busy={loading}>
        <p>Para excluir <strong>{restaurant.nome}</strong>, digite a senha da sua conta de admin.</p>
        <label className={formStyles.field} htmlFor="senha">Senha do admin</label><PasswordInput disabled={loading} />
        <button className={styles.removeMember} disabled={loading}>{loading ? 'Aguarde...' : 'Confirmar exclusão permanente'}</button>
        <button type="button" className={formStyles.button} disabled={loading} onClick={() => { setConfirming(false); setError(''); }}>Cancelar</button>
      </form> : <button className={styles.removeMember} disabled={loading} onClick={() => { setConfirming(true); setError(''); setNotice(''); }}>Excluir restaurante</button>}
    </section>
  </div>;
}
