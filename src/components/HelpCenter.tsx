'use client';

import { useState } from 'react';
import Link from 'next/link';
import { filterHelpTopics, HELP_GROUPS } from '@/src/lib/help-content';
import Icon from './Icon';
import styles from './help.module.css';
import { TUTORIAL_EVENT } from '@/src/lib/tutorial';

const firstSteps = [
  { title: 'Organize a casa', text: 'Prepare categorias, fornecedores e produtos.', href: '/dashboard/catalog', icon: 'store' },
  { title: 'Registre os gastos', text: 'Guarde as compras, contas e diárias.', href: '/dashboard/expenses', icon: 'receipt' },
  { title: 'Feche as vendas', text: 'O dono informa o faturamento e as quantidades.', href: '/dashboard/revenue', icon: 'check' },
  { title: 'Entenda o resultado', text: 'Compare as vendas com todos os gastos.', href: '/dashboard/profit', icon: 'chart' },
] as const;

export default function HelpCenter({ role, platformAdmin = false }: { role: 'owner' | 'employee'; platformAdmin?: boolean }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const topics = filterHelpTopics(query, group).filter(topic => !topic.platformOnly || platformAdmin);
  const searching = query.trim().length > 0;
  function reset() { setQuery(''); setGroup('all'); }
  return <div className={styles.center}>
    <section className={styles.start} aria-labelledby="help-start-title">
      <div className={styles.sectionHeading}>
        <div><span className={styles.eyebrow}>COMECE POR AQUI</span><h2 id="help-start-title">Sua rotina em quatro passos</h2></div>
        <button type="button" className="button button-outline" onClick={() => window.dispatchEvent(new Event(TUTORIAL_EVENT))}>Rever tutorial</button>
        <span className={styles.role}><Icon name="shield" size={16} />Seu acesso: {role === 'owner' ? 'Dono' : 'Funcionário'}</span>
      </div>
      <ol className={styles.steps}>{firstSteps.map((step, index) => <li key={step.href}>
        <Link href={step.href}>
          <span className={styles.stepTop}><span className={styles.stepNumber}>0{index + 1}</span><Icon name={step.icon} size={21} /></span>
          <h3>{step.title}</h3><p>{step.text}</p><span className={styles.stepLink}>Abrir {index === 0 ? 'Cadastros' : index === 1 ? 'Lançamentos' : index === 2 ? 'Faturamento' : 'Lucro'} <Icon name="arrow" size={16} /></span>
        </Link>
      </li>)}</ol>
    </section>

    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Encontrar uma orientação">
        <label className={styles.searchLabel} htmlFor="help-search">Qual é a sua dúvida?</label>
        <div className={styles.searchBox}><Icon name="help" size={19} /><input id="help-search" type="search" value={query}
          onChange={event => setQuery(event.target.value)} placeholder="Ex.: arroz, pedidos, CSV..." maxLength={160} aria-controls="help-results" /></div>
        <p className={styles.searchHint}>Busque uma ação, um campo ou o nome de uma tela.</p>
        <nav className={styles.topicsNav} aria-label="Assuntos da ajuda">
          <button type="button" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>Todos os assuntos <Icon name="arrow" size={14} /></button>
          {HELP_GROUPS.filter(item => item.id !== 'platform' || platformAdmin).map(item => <button type="button" key={item.id} aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>{item.label}<Icon name="arrow" size={14} /></button>)}
        </nav>
        <p className={styles.sidebarNote}>Abra uma pergunta para ver o passo a passo. Os atalhos levam à tela em que você faz a ação.</p>
      </aside>

      <div className={styles.results} id="help-results">
        <div className={styles.resultsHeading}><div><h2>{searching ? 'Vamos encontrar sua resposta' : group === 'all' ? 'O guia do seu restaurante' : HELP_GROUPS.find(item => item.id === group)?.label}</h2>
          <p role="status">{topics.length} {topics.length === 1 ? 'orientação encontrada' : 'orientações encontradas'}{searching && <> para “{query.trim()}”</>}</p></div>
          {(searching || group !== 'all') && <button type="button" className={styles.clear} onClick={reset}>Limpar busca e filtros</button>}
        </div>
        {!topics.length ? <div className={styles.empty}><Icon name="help" size={32} /><h3>Não encontramos esse assunto.</h3><p>Tente um termo mais simples, como “produto”, “faturamento” ou “importar”, ou consulte todos os assuntos.</p><button type="button" className="button button-outline" onClick={reset}>Ver todas as orientações</button></div>
          : <div className={styles.topicList}>{topics.map(topic => <details key={topic.id} className={styles.topic} open={searching ? true : undefined}>
            <summary><span><span className={styles.topicMeta}>{HELP_GROUPS.find(item => item.id === topic.group)?.label}{topic.ownerOnly && <span className={styles.ownerBadge}>Ação do dono</span>}</span>
              <h3>{topic.title}</h3><span className={styles.topicSummary}>{topic.summary}</span></span><span className={styles.expand} aria-hidden="true">+</span></summary>
            <div className={styles.answer}>
              <ol>{topic.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
              {topic.example && <div className={styles.example}><strong>Na prática</strong><p>{topic.example}</p></div>}
              {topic.note && <p className={styles.note}><Icon name="help" size={18} /><span>{topic.note}</span></p>}
              {topic.href && <Link href={topic.href} className={styles.action}>{topic.ownerOnly && role === 'employee' ? 'Consultar esta área' : topic.action}<Icon name="arrow" size={16} /></Link>}
            </div>
          </details>)}</div>}

        <section className={styles.exampleDay} aria-labelledby="help-example-title">
          <div><span className={styles.eyebrow}>ENTENDA COM UM EXEMPLO</span><h2 id="help-example-title">O caminho do dinheiro no sistema</h2><p>Imagine um dia com R$ 2.000,00 em vendas e R$ 1.200,00 em gastos, incluindo contas a pagar.</p></div>
          <div className={styles.formula}><dl><dt>Faturamento</dt><dd>R$ 2.000,00<small>Vendas registradas no dia</small></dd></dl><span aria-hidden="true">−</span><dl><dt>Gastos</dt><dd>R$ 1.200,00<small>Pagos e a pagar</small></dd></dl><span aria-hidden="true">=</span><dl className={styles.result}><dt>Resultado</dt><dd>R$ 800,00<small>Lucro nesse exemplo</small></dd></dl></div>
          <p className={styles.exampleFoot}>Os produtos detalham os R$ 1.200,00 em gastos. Pedidos, marmitex e pratos são quantidades e não são somados aos valores em reais.</p>
        </section>
      </div>
    </div>
  </div>;
}
