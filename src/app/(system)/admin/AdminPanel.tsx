'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PlatformOverview } from '@/src/models/Platform';
import { api, errorMessage } from '@/src/lib/api';
import PasswordInput from '@/src/components/PasswordInput';
import Icon from '@/src/components/Icon';
import styles from './admin.module.css';

type Change = {action:'restaurant'|'user';id:string;ativo:boolean;expectedActive:boolean;name:string} | {action:'settings';maxRestaurants:number;maxUsers:number;expectedSettings:PlatformOverview['settings']};
function describe(value:unknown) {
  if (!value || typeof value!=='object') return '';
  const row=value as Record<string,unknown>;
  return typeof row.ativo==='boolean' ? row.ativo?'Ativo':'Suspenso' : `Restaurantes: ${row.maxRestaurants} · Usuários: ${row.maxUsers}`;
}
export default function AdminPanel({initialData,adminId}:{initialData:PlatformOverview;adminId:string}) {
  const [data,setData]=useState(initialData);
  const [tab,setTab]=useState<'restaurants'|'users'|'settings'|'audit'>('restaurants');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [pending,setPending]=useState<Change|null>(null);
  const [dialogError,setDialogError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ if(pending) dialog.current?.showModal(); else dialog.current?.close(); },[pending]);
  async function load(page=1) {
    if(busy)return;setBusy(true);setError('');
    try { setData((await api.get('/platform-admin',{params:{q:search,page}})).data); }
    catch(cause){setError(errorMessage(cause));}finally{setBusy(false);}
  }
  function prepare(change:Change){setDialogError('');setPending(change);}
  async function confirm(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!pending||busy)return;
    const senha=new FormData(event.currentTarget).get('senha');
    setBusy(true);setDialogError('');setMessage('');
    try {
      await api.patch('/platform-admin',{...pending,senha});
      setPending(null);setMessage('Alteração salva com sucesso.');
      try {setData((await api.get('/platform-admin',{params:{q:data.query,page:data.page}})).data);}
      catch {setError('Alteração salva. Atualize a lista para ver a situação atual.');}
    }catch(cause){setDialogError(errorMessage(cause));}finally{setBusy(false);}
  }
  function limits(event:FormEvent<HTMLFormElement>){event.preventDefault();const values=new FormData(event.currentTarget);prepare({action:'settings',maxRestaurants:Number(values.get('restaurants')),maxUsers:Number(values.get('users')),expectedSettings:data.settings});}
  return <main className={styles.main}>
    <div className={styles.heading}><div><span className="eyebrow">Seu controle da plataforma</span><h1>Administração</h1><p>Gerencie cadastros, capacidade e acesso ao Saldo da Casa.</p></div><span className={styles.privateBadge}><Icon name="shield" size={17}/>Acesso exclusivo</span></div>
    <div className={styles.metrics}><article><span>Restaurantes cadastrados</span><strong>{data.totals.restaurants} <small>/ {data.settings.maxRestaurants}</small></strong><p>{data.totals.activeRestaurants} ativos</p></article><article><span>Usuários cadastrados</span><strong>{data.totals.users} <small>/ {data.settings.maxUsers}</small></strong><p>{data.totals.activeUsers} ativos</p></article></div>
    <nav className={styles.tabs} aria-label="Administração">{([['restaurants','Restaurantes'],['users','Usuários'],['settings','Limites'],['audit','Histórico']] as const).map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
    {message&&<p className={styles.success} role="status">{message}</p>}{error&&<p className={styles.error} role="alert">{error}</p>}
    {(tab==='restaurants'||tab==='users')&&<section className={styles.card}>
      <form className={styles.search} onSubmit={event=>{event.preventDefault();void load();}}><label htmlFor="admin-search">Buscar por nome ou e-mail<input id="admin-search" value={search} onChange={event=>setSearch(event.target.value)} maxLength={120} placeholder="Nome do restaurante ou da pessoa"/></label><button className="button" disabled={busy}>Buscar</button></form>
      <div className={styles.tableWrap}><table><thead><tr><th>{tab==='restaurants'?'Restaurante':'Pessoa'}</th><th>{tab==='restaurants'?'Responsável / equipe':'E-mail'}</th><th>Situação</th><th>Ação</th></tr></thead><tbody>
        {tab==='restaurants'?data.restaurants.map(row=><tr key={row.id}><td><strong>{row.nome}</strong></td><td>{row.owners||'Sem dono vinculado'}<small>{row.members} membros</small></td><td><span className={row.ativo?styles.active:styles.inactive}>{row.ativo?'Ativo':'Suspenso'}</span></td><td><button className={row.ativo?styles.suspend:styles.activate} type="button" disabled={busy} onClick={()=>prepare({action:'restaurant',id:row.id,ativo:!row.ativo,expectedActive:row.ativo,name:row.nome})}>{row.ativo?'Desativar':'Ativar'}</button></td></tr>):data.users.map(row=><tr key={row.id}><td><strong>{row.nome}</strong>{row.id===adminId&&<small>Sua conta administradora</small>}</td><td>{row.email}<small>{row.emailVerified?'E-mail confirmado':'E-mail pendente'}</small></td><td><span className={row.ativo?styles.active:styles.inactive}>{row.ativo?'Ativo':'Suspenso'}</span></td><td><button className={row.ativo?styles.suspend:styles.activate} type="button" disabled={busy||row.id===adminId} onClick={()=>prepare({action:'user',id:row.id,ativo:!row.ativo,expectedActive:row.ativo,name:row.email})}>{row.ativo?'Desativar':'Ativar'}</button></td></tr>)}
      </tbody></table></div>
      {!(tab==='restaurants'?data.restaurants:data.users).length&&<p className={styles.empty}>Nenhum cadastro encontrado.</p>}
      <div className={styles.pagination}><button className="button button-outline" disabled={busy||data.page<=1} onClick={()=>void load(data.page-1)}>Anterior</button><span>Página {data.page}</span><button className="button button-outline" disabled={busy||!data.hasNext} onClick={()=>void load(data.page+1)}>Próxima</button></div>
    </section>}
    {tab==='settings'&&<section className={styles.card}><h2>Capacidade do sistema</h2><p>Os totais incluem cadastros suspensos. Reduzir um limite preserva os dados existentes e bloqueia novos cadastros até haver capacidade. Zero fecha novos cadastros.</p><form key={`${data.settings.maxRestaurants}-${data.settings.maxUsers}`} className={styles.limits} onSubmit={limits}><label htmlFor="restaurant-limit">Máximo de restaurantes<input id="restaurant-limit" name="restaurants" type="number" min={0} max={1000000} step={1} defaultValue={data.settings.maxRestaurants} required/></label><label htmlFor="user-limit">Máximo de usuários<input id="user-limit" name="users" type="number" min={0} max={1000000} step={1} defaultValue={data.settings.maxUsers} required/></label><button className="button" disabled={busy}>Salvar limites</button></form></section>}
    {tab==='audit'&&<section className={styles.card}><h2>Últimas alterações</h2><p>Registro das alterações de acesso e capacidade feitas neste painel.</p><ul className={styles.audit}>{data.audit.map(row=><li key={row.id}><strong>{row.action==='settings'?'Limites atualizados':row.action==='restaurant'?'Situação de restaurante alterada':'Situação de usuário alterada'}</strong><span>{new Date(row.createdAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</span>{row.targetId&&<small>Cadastro: {row.targetId}</small>}<span>{describe(row.before)} → {describe(row.after)}</span></li>)}</ul>{!data.audit.length&&<p className={styles.empty}>Nenhuma alteração registrada.</p>}</section>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="admin-confirm-title" onCancel={event=>{event.preventDefault();if(!busy)setPending(null);}}>{pending&&<form onSubmit={confirm}><h2 id="admin-confirm-title">{pending.action==='settings'?'Alterar limites?':pending.ativo?'Reativar acesso?':'Desativar acesso?'}</h2>{pending.action==='settings'?<p>Os limites serão atualizados para {pending.maxRestaurants} restaurantes e {pending.maxUsers} usuários.</p>:<><strong>{pending.name}</strong><p>{pending.ativo?'O acesso será permitido novamente. Será necessário entrar novamente após uma suspensão.':pending.action==='restaurant'?'O dono e os funcionários perderão o acesso a este restaurante. Todos os dados serão preservados.':'Esta pessoa perderá o acesso ao sistema e suas sessões serão encerradas. Os dados serão preservados.'}</p></>}<label htmlFor="senha">Confirme sua senha</label><PasswordInput disabled={busy}/>{dialogError&&<p className={styles.error} role="alert">{dialogError}</p>}<div className={styles.actions}><button type="button" className="button button-outline" disabled={busy} onClick={()=>setPending(null)}>Cancelar</button><button className="button" disabled={busy}>{busy?'Salvando...':'Confirmar alteração'}</button></div></form>}</dialog>
  </main>;
}
