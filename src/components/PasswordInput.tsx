'use client';
import { useState } from 'react';
import Icon from './Icon';
import styles from './auth.module.css';
export default function PasswordInput({ registration = false, disabled = false }: { registration?: boolean; disabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className={styles.passwordWrap}><input className={styles.input} id="senha" name="senha" type={visible ? 'text' : 'password'} autoComplete={registration ? 'new-password' : 'current-password'} minLength={registration ? 6 : undefined} placeholder={registration ? 'Crie uma senha com 6 caracteres ou mais' : 'Digite sua senha'} required disabled={disabled} aria-describedby={registration ? 'senha-hint' : undefined} /><button className={styles.eyeButton} type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}><Icon name="eye" size={19} /></button></div>;
}
