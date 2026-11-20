'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, errorMessage } from '@/src/lib/api';
import { TUTORIAL_EVENT, tutorialSteps } from '@/src/lib/tutorial';
import styles from './tutorial.module.css';

export default function GuidedTour({ completed, owner }: { completed: boolean; owner: boolean }) {
  const [index, setIndex] = useState<number | null>(completed ? null : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const steps = tutorialSteps(owner);
  const step = index === null ? null : steps[index];
  const navigating = !!step?.href && pathname !== step.href;

  useEffect(() => {
    const start = () => { setError(''); setIndex(0); };
    window.addEventListener(TUTORIAL_EVENT, start);
    return () => window.removeEventListener(TUTORIAL_EVENT, start);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (index === null) { element?.close(); return; }
    if (!element?.open) element?.showModal();
    heading.current?.focus();
  }, [index, pathname]);
  useEffect(() => {
    if (!step?.href || navigating) return;
    const link = document.querySelector<HTMLAnchorElement>(`nav[aria-label="Áreas do restaurante"] a[href="${step.href}"]`);
    link?.setAttribute('data-tour-current', 'true');
    link?.classList.add(styles.highlight);
    const reveal = () => link?.scrollIntoView({ block: 'nearest', inline: 'center' });
    reveal();
    window.addEventListener('resize', reveal);
    return () => {
      window.removeEventListener('resize', reveal);
      link?.removeAttribute('data-tour-current');
      link?.classList.remove(styles.highlight);
    };
  }, [step?.href, navigating, pathname]);

  function move(next: number) {
    setError('');
    setIndex(next);
    if (steps[next].href) router.push(steps[next].href, { scroll: false });
  }
  async function finish() {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await api.post('/auth/tutorial');
      setIndex(null);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }
  if (!step || index === null) return null;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="tour-title" aria-describedby="tour-description"
    onCancel={event => { event.preventDefault(); void finish(); }}>
    <p className={styles.progress}>Conheça o sistema · {index + 1} de {steps.length}</p>
    <h2 id="tour-title" ref={heading} tabIndex={-1}>{step.title}</h2>
    <p id="tour-description">{step.text}</p>
    {navigating && <p role="status">Abrindo a aba… <button type="button" onClick={() => router.push(step.href, { scroll: false })}>Tentar abrir novamente</button></p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <button type="button" onClick={() => void finish()} disabled={saving}>Pular tutorial</button>
      {index > 0 && <button type="button" onClick={() => move(index - 1)} disabled={saving || navigating}>Anterior</button>}
      <button className={styles.next} type="button" disabled={saving || navigating}
        onClick={() => index === steps.length - 1 ? void finish() : move(index + 1)}>
        {saving ? 'Salvando…' : index === 0 ? 'Começar' : index === steps.length - 1 ? 'Concluir tutorial' : 'Próxima'}
      </button>
    </div>
  </dialog>;
}
