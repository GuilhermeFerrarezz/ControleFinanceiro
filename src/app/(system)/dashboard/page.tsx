'use client'
import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import Header from '@/src/components/cabecalho/page';

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
        <>
            <Header nome= 'Restaurante do Jose'></Header>
        
        </>
        
        

    )













}

