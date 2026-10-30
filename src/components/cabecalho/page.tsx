'use client';
import { api, clearLegacyAuth, errorMessage } from '@/src/lib/api';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Brand from '../Brand';
import Icon from '../Icon';
import styles from './cabecalho.module.css';
export default function Header({ nome, user }: { nome: string; user: { nome: string; email: string; role?: string } }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const menu = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  useEffect(() => { clearLegacyAuth(); }, []);
  useEffect(() => {
    function close(event: PointerEvent) { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { setMenuOpen(false); button.current?.focus(); } }
    if (menuOpen) { document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape); }
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  async function logout() {
    if (loading) return;
    setLoading(true); setMessage('');
    try { await api.post('/auth/logout'); clearLegacyAuth(); router.replace('/login'); router.refresh(); }
    catch (error) { setMessage(errorMessage(error)); setLoading(false); }
  }
  return <header className={styles.header}><div className={styles.inner}><Brand /><span className={styles.restaurant}><Icon name="store" size={17} />{nome}</span><div className={styles.account} ref={menu}><button ref={button} className={styles.accountButton} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="account-options"><span className={styles.avatar}>{user.nome.trim().slice(0, 2).toUpperCase()}</span><span className={styles.accountName}>{user.nome}<small>{user.role === 'owner' ? 'Dono do restaurante' : 'Minha conta'}</small></span><span aria-hidden="true">⌄</span></button>{menuOpen && <div id="account-options" className={styles.dropdown}><strong>{user.nome}</strong><span>{user.email}</span><button onClick={logout} disabled={loading}><Icon name="logout" size={16} />{loading ? 'Saindo...' : 'Sair da conta'}</button>{message && <p role="alert">{message}</p>}</div>}</div></div></header>;
}
