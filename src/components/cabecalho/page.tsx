'use client';
import { api, clearLegacyAuth, errorMessage } from '@/src/lib/api';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './cabecalho.module.css';

export default function Header({ nome, user }: { nome: string; user: { nome: string; email: string } }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  useEffect(() => { clearLegacyAuth(); }, []);
  async function logout() {
    if (loading) return;
    setLoading(true); setMessage('');
    try {
      await api.post('/auth/logout');
      clearLegacyAuth(); router.replace('/login'); router.refresh();
    } catch (error) { setMessage(errorMessage(error)); setLoading(false); }
  }
  return <header className={styles.headerContainer}>
    <div className={styles.logo}><h2>{nome}</h2></div>
    <div className={styles.profileSection}>
      <button className={styles.avatar} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="account-options" aria-label="Opções da conta">☰</button>
      <div className={styles.userInfo}><span className={styles.userName}>{user.nome}</span><span className={styles.userEmail}>{user.email}</span></div>
      {menuOpen && <div id="account-options" className={styles.dropdownMenu}>
        <button className={styles.logoutBtn} onClick={logout} disabled={loading}>{loading ? 'Saindo...' : 'Sair da conta'}</button>
        {message && <p role="alert">{message}</p>}
      </div>}
    </div>
  </header>;
}
