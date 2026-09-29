'use client';
import { api } from '../../lib/api'
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './cabecalho.module.css'; 

export default function Header(props: any) {
    const [user, setUser] = useState<{ name?: string; nome?: string; email?: string } | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const router = useRouter(); 

    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }
    }, []);

    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
    };

    const handleLogout = async () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        await api.post('/auth/logout')
        router.push('/login'); 
    };

    return (
        <header className={styles.headerContainer}>
            <div className={styles.logo}>
                <h2>{props.nome}</h2>
                
            </div>

            <div className={styles.profileSection}>
                <div className={styles.avatar} onClick={toggleMenu}>
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                </div>

                <div className={styles.userInfo}>
                    <span className={styles.userName}>
                        {user ? (user.name || user.nome) : 'Carregando...'}
                    </span>
                    <span className={styles.userEmail}>
                        {user ? user.email : ''}
                    </span>
                </div>

                {menuOpen && (
                    <div className={styles.dropdownMenu}>
                        <button onClick={handleLogout} className={styles.logoutBtn}>
                            <svg stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                            Sair da conta
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}