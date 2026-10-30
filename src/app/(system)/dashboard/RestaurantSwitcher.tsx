'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/src/lib/api';
import styles from './dashboard.module.css';
export default function RestaurantSwitcher({ restaurants, selected }: { restaurants: { id: string; nome: string }[]; selected: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  if (restaurants.length < 2) return null;
  async function switchTo(empresaId: string) {
    setLoading(true); setMessage('');
    try { await api.post('/company/switch', { empresaId }); router.refresh(); } catch (error) { setMessage(errorMessage(error)); } finally { setLoading(false); }
  }
  return <div><label className={styles.selectLabel} htmlFor="restaurant-select">Restaurante ativo<select id="restaurant-select" className={styles.select} value={selected} disabled={loading} onChange={event => switchTo(event.target.value)}>{restaurants.map(restaurant => <option key={restaurant.id} value={restaurant.id}>{restaurant.nome}</option>)}</select></label>{message && <p className={styles.error} role="alert">{message}</p>}</div>;
}
