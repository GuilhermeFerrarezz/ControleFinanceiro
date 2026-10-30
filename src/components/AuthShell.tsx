import type { ReactNode } from 'react';
import Link from 'next/link';
import Brand from './Brand';
import Icon from './Icon';
import styles from './auth.module.css';
export default function AuthShell({ children, mode = 'login', loginHref = '/login', registerHref = '/register' }: { children: ReactNode; mode?: 'login' | 'register' | 'invite'; loginHref?: string; registerHref?: string }) {
  const register = mode === 'register';
  return <main className={styles.shell}>
    <aside className={styles.story}><Brand light /><div className={styles.storyContent}><span className="eyebrow">Um ingrediente a mais na sua gestão</span><h2>Bom de cozinha.<br /><em>Bom de negócio.</em></h2><p>Seu restaurante tem uma história.<br />Vamos organizar os próximos capítulos.</p><div className={styles.storyIllustration}><div className={styles.orbit}><Icon name="leaf" size={65} /></div><span className={styles.floatingNote}><Icon name="team" size={21} />Uma equipe. A mesma receita.</span><span className={styles.floatingIcon}><Icon name="receipt" size={27} /></span></div><div className={styles.storyBottom}><Icon name="shield" size={19} /><span>Contas individuais.<br /><strong>Cuidado compartilhado.</strong></span></div></div><span className={styles.storyFoot}>FEITO PARA A ROTINA REAL DE UM RESTAURANTE.</span></aside>
    <section className={styles.formSide}><div className={styles.mobileBrand}><Brand /></div><div className={styles.topLink}>{register ? <>Já faz parte da casa? <Link href={loginHref}>Entrar <span>↗</span></Link></> : <>Ainda não tem conta? <Link href={registerHref}>Começar agora <span>↗</span></Link></>}</div><div className={styles.formContent}>{children}</div><footer className={styles.formFooter}><Icon name="shield" size={14} /><span>Seu acesso é pessoal. Seu restaurante, conectado.</span><Link href="/">Voltar ao início</Link></footer></section>
  </main>;
}
