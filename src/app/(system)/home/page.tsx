'use client'
import React, { useEffect, useState } from 'react';
import styles from './home.module.css';
import Header from '@/src/components/cabecalho/page';

export default function Home() {
    const [user, setUser] = useState<any>(null)
    const loadUser = async () => {
         const savedUser = localStorage.getItem('user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
            console.log(savedUser)
        }


    }
    useEffect(() => {
        loadUser()
    }, []);
    

    return (
        <>
            <Header nome={user?.empresaId !== null ? 'Restaurante do Jose' : 'HOME'}></Header>
        
        </>
        
        

    )













}

