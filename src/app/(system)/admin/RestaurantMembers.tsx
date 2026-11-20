'use client';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/src/lib/api';
import type { PlatformRestaurantMembers } from '@/src/lib/platform-shared';
import styles from './admin.module.css';

export default function RestaurantMembers({ restaurantId, name }: { restaurantId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PlatformRestaurantMembers | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(page = 1) {
    if (busy) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true); setError('');
    try {
      const response = await api.get<PlatformRestaurantMembers>('/platform-admin', {
        params: { restaurantId, page }, signal: request.signal,
      });
      setData(response.data);
    } catch (cause) { if (!request.signal.aborted) setError(errorMessage(cause)); }
    finally { if (!request.signal.aborted) setBusy(false); }
  }
  return <div className={styles.members}>
    <button type="button" className={styles.membersToggle} aria-expanded={open} aria-controls={`members-${restaurantId}`}
      onClick={() => { setOpen(!open); if (!open) void load(); }}>
      {open ? 'Ocultar integrantes' : 'Ver integrantes'}
    </button>
    {open && <section id={`members-${restaurantId}`} aria-label={`Integrantes de ${name}`} aria-busy={busy}>
      {busy && <p role="status">Carregando integrantes...</p>}
      {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={() => void load(data?.page ?? 1)}>Tentar novamente</button></p>}
      {data && <>
        {!data.restaurant.ativo && <p>Restaurante suspenso: os integrantes não têm acesso a ele.</p>}
        <ul className={styles.membersList}>{data.members.map(member => <li key={member.id}>
          <strong>{member.nome}</strong><span>{member.email}</span>
          <span>{member.role === 'owner' ? 'Dono' : 'Funcionário'} · {member.ativo ? 'Conta ativa' : 'Conta suspensa'}</span>
          <span>{member.emailVerified ? 'E-mail confirmado' : 'E-mail pendente'}</span>
        </li>)}</ul>
        {!data.members.length && <p>Nenhum integrante nesta página.</p>}
        <div className={styles.membersPagination}>
          <button type="button" disabled={busy || data.page <= 1} onClick={() => void load(data.page - 1)}>Anterior</button>
          <span>Página {data.page}</span>
          <button type="button" disabled={busy || !data.hasNext} onClick={() => void load(data.page + 1)}>Próxima</button>
        </div>
      </>}
    </section>}
  </div>;
}
