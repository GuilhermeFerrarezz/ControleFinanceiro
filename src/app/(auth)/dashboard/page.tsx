'use client'
import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
export default function Dashboard() {
    const [user, setUser] = useState<any>(null)
    const loadUser = async () => {
         const savedUser = localStorage.getItem('user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }


    }
    useEffect(() => {
        loadUser()
    }, []);
    

    return (
        
        <div className={styles.userInfo}><p></p>
                    <span className="styles.user-name">
                        {user ? user.nome : 'Carregando...'}
                    </span>
                    <span className="user-email">
                        {user ? user.email : ''}
                    </span>
            </div>

    )













}

