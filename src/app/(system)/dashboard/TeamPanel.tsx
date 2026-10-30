'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage } from '@/src/lib/api';
import Icon from '@/src/components/Icon';
import styles from './dashboard.module.css';
import financeStyles from '@/src/components/finance.module.css';
type Member = { id: string; nome: string; email: string; role: string };
export default function TeamPanel({ members, invitations }: { members: Member[]; invitations: { id: string; email: string; expiresAt: string }[] }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const router = useRouter();
  const [removing,setRemoving] = useState<Member | null>(null);
  const [removeBusy,setRemoveBusy] = useState(false);
  const [removeError,setRemoveError] = useState('');
  const [teamMessage,setTeamMessage] = useState('');
  const removeDialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{ if(removing) removeDialog.current?.showModal(); else removeDialog.current?.close(); },[removing]);
  async function removeMember() {
    if(!removing || removeBusy) return;
    setRemoveBusy(true);setRemoveError('');
    try {
      await api.delete(`/members/${removing.id}`);
      setTeamMessage(`${removing.nome} foi removido da equipe. Os lançamentos e a autoria foram preservados.`);
      setRemoving(null);router.refresh();
    } catch(error) { setRemoveError(errorMessage(error)); }
    finally { setRemoveBusy(false); }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading) return;
    const form = event.currentTarget;
    const email = new FormData(form).get('email');
    setLoading(true); setMessage(''); setLink(''); setCopied(false);
    try { const response = await api.post('/invitations', { email }); setLink(`${window.location.origin}${response.data.path}`); form.reset(); router.refresh(); }
    catch (error) { setMessage(errorMessage(error)); } finally { setLoading(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setMessage('Selecione e copie o link no campo abaixo.'); }
  }
  async function revoke(id: string) {
    if (revoking) return;
    setRevoking(id); setMessage('');
    try { await api.delete(`/invitations/${id}`); setLink(''); router.refresh(); } catch (error) { setMessage(errorMessage(error)); } finally { setRevoking(null); }
  }
  return <><div className={styles.teamGrid}><section className={styles.teamCard}><div className={styles.sectionTitle}><Icon name="team" /><h2>Sua equipe</h2><span>{members.length}</span></div><p className={styles.subtitle}>Pessoas que fazem parte desta casa.</p>{teamMessage && <p className={styles.teamNotice} role="status">{teamMessage}</p>}<ul className={styles.memberList}>{members.map(member => <li key={member.id}><span className={styles.avatar}>{member.nome?.slice(0, 2).toUpperCase()}</span><div><strong>{member.nome}</strong><span>{member.email}</span></div><div className={styles.memberActions}><span className={styles.role}>{member.role === 'owner' ? 'Dono' : 'Funcionário'}</span>{member.role === 'employee' && <button type="button" className={styles.removeMember} aria-label={`Remover ${member.nome} da equipe`} onClick={()=>{setRemoveError('');setRemoving(member);}}><Icon name="trash" size={16}/>Remover</button>}</div></li>)}</ul>{invitations.length > 0 && <><h3 className={styles.pendingTitle}>Convites aguardando aceite</h3><ul className={styles.pendingList}>{invitations.map(invitation => <li key={invitation.id}><Icon name="mail" size={18} /><div><strong>{invitation.email}</strong><span>Válido até {new Date(invitation.expiresAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></div><button onClick={() => revoke(invitation.id)} disabled={revoking !== null} aria-label={`Revogar convite de ${invitation.email}`}>{revoking === invitation.id ? 'Revogando...' : 'Revogar'}</button></li>)}</ul></>}</section><section className={styles.inviteCard}><span className={styles.inviteIcon}><Icon name="plus" size={24} /></span><h2>Traga sua equipe<br />para a mesma mesa.</h2><p>Informe o e-mail do funcionário e compartilhe o link pessoal de convite com ele.</p><form onSubmit={invite}><label htmlFor="invite-email">E-mail do funcionário</label><input id="invite-email" name="email" type="email" placeholder="pessoa@exemplo.com" autoComplete="email" maxLength={254} required /><button className="button" disabled={loading}>{loading ? 'Gerando convite...' : 'Gerar link de convite'}<Icon name="arrow" size={17} /></button></form><span className={styles.inviteHint}><Icon name="shield" size={14} />Acesso de funcionário. Convite válido por 7 dias.</span>{link && <div className={styles.linkBox}><p role="status">Convite pronto! Copie e compartilhe com a pessoa.</p><label htmlFor="invitation-link">Link pessoal do convite</label><input id="invitation-link" value={link} readOnly onFocus={event => event.target.select()} /><button className="button button-outline" onClick={copy}>{copied ? 'Link copiado!' : 'Copiar convite'}</button><small>Por segurança, o link só aparece agora. Gerar outro convite para o mesmo e-mail invalida o anterior.</small></div>}{message && <p className={styles.error} role="alert">{message}</p>}</section></div><dialog ref={removeDialog} className={`${financeStyles.dialog} ${financeStyles.confirmDialog}`} aria-labelledby="remove-member-title" onCancel={event=>{event.preventDefault();if(!removeBusy)setRemoving(null);}}><div className={financeStyles.dialogInner}><h2 id="remove-member-title">Remover funcionário?</h2><p><strong>{removing?.nome}</strong> perderá o acesso a este restaurante. Os gastos que essa pessoa lançou continuarão registrados com sua autoria. Você poderá convidá-la novamente depois.</p>{removeError && <p className={styles.error} role="alert">{removeError}</p>}<div className={financeStyles.formActions}><button type="button" className="button button-outline" disabled={removeBusy} onClick={()=>setRemoving(null)}>Manter acesso</button><button type="button" className={financeStyles.dangerButton} disabled={removeBusy} onClick={removeMember}>{removeBusy?'Removendo...':'Remover funcionário'}</button></div></div></dialog></>;
}
