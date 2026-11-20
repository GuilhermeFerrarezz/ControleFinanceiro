'use client';
import { MIN_PASSWORD_LENGTH, newPasswordError, passwordRequirements } from '@/src/lib/password-policy';
import { useState } from 'react';
import Icon from './Icon';
import styles from './auth.module.css';

export default function PasswordInput({ registration = false, disabled = false }: { registration?: boolean; disabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState('');
  const checks = passwordRequirements(password);
  const requirements = [
    { met: checks.length, label: 'Pelo menos ' + MIN_PASSWORD_LENGTH + ' caracteres' },
    { met: checks.uppercase, label: 'Uma letra maiúscula' },
    { met: checks.symbol, label: 'Um símbolo (ex.: !, @ ou #)' },
  ];
  return <>
    <div className={styles.passwordWrap}>
      <input className={styles.input} id="senha" name="senha" type={visible ? 'text' : 'password'}
        autoComplete={registration ? 'new-password' : 'current-password'}
        minLength={registration ? MIN_PASSWORD_LENGTH : undefined}
        placeholder={registration ? 'Crie sua senha' : 'Digite sua senha'} required disabled={disabled}
        aria-describedby={registration ? 'senha-requirements' : undefined}
        onInput={event => {
          const input = event.currentTarget;
          setPassword(input.value);
          if (registration) input.setCustomValidity(newPasswordError(input.value));
        }}
        onInvalid={event => {
          if (registration) event.currentTarget.setCustomValidity(newPasswordError(event.currentTarget.value));
        }} />
      <button className={styles.eyeButton} type="button" onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}>
        <Icon name="eye" size={19} />
      </button>
    </div>
    {registration && <ul id="senha-requirements" className={styles.passwordRequirements} aria-live="polite" aria-atomic="true">
      {requirements.map(item => <li key={item.label} className={item.met ? styles.requirementMet : undefined}>
        <span aria-hidden="true">{item.met ? '✓' : '○'}</span> {item.label}
        <span className={styles.requirementStatus}> — {item.met ? 'Atendido' : 'Pendente'}</span>
      </li>)}
    </ul>}
  </>;
}
