# Auditoria AppSec — 18/11/2026

Revisão do código local de autenticação, autorização, APIs, repositórios SQL, limites de recursos e fronteiras Next.js. Não é uma certificação de invulnerabilidade nem uma verificação das contas externas Vercel, Neon e Resend.

## Correções aplicadas

- Cadastro sem enumeração explícita: status 201 e corpo iguais para endereço novo, existente, conflito concorrente ou falta de vagas. Removidos `emailSent`/`emailDelivery`. Bcrypt é executado antes da consulta de existência e um piso de 500 ms reduz diferenças de tempo; lentidão variável ainda pode produzir diferenças. Nome, restaurante e senha não são sobrescritos em cadastros repetidos. Convites são validados independentemente da existência do e-mail e novamente sob bloqueio ao serem consumidos.
- Apenas o envio do cadastro roda após a resposta com `after`; criação e emissão do hash do token continuam em uma transação concluída antes do retorno. O formulário orienta confirmação, recuperação e contato com o administrador sem prometer criação ou entrega. Desenvolvimento sem chave mantém o link somente no terminal.
- Administração exige `platformRole === 'ADMIN'` no backend e na página. O papel vem exclusivamente do UUID configurado no servidor e de e-mail confirmado, separado do papel do restaurante. Sessão, atividade, senha e permissão são revalidadas sob bloqueio para mutações. A consulta de sessão antecede a autorização; as consultas administrativas só ocorrem depois dela.
- Exclusões de restaurante e de períodos de gastos agora revalidam a senha comparada e a sessão dentro da transação. Troca concorrente de senha, logout, suspensão ou expiração invalidam uma confirmação antiga antes da gravação. Exclusão de restaurante e criação de sessão bloqueiam o restaurante antes da identidade/sessões, evitando inversão de bloqueios entre esses fluxos e entre duas exclusões concorrentes.
- Limites globais no PostgreSQL complementam os limites existentes por endereço/IP e evitam depender de memória compartilhada ou de um cabeçalho de IP configurado. Exportação de faturamento passa pelo mesmo orçamento de exportações.
- `server-only` impede que banco, segredos do Resend e identidade administrativa sejam importados por componentes de cliente no build Next. DTOs públicos do painel estão em módulo próprio. Comandos Node/testes usam a condição `react-server`.
- Conexões com hosts Neon usam `sslmode=verify-full`, removendo opções que enfraquecem TLS. O pool tem até cinco conexões por processo e channel binding quando suportado. PostgreSQL local e parâmetros de isolamento dos testes são preservados.
- Troca de restaurante valida UUID antes de consultar vínculos; origem pública malformada fecha o acesso mesmo sem cabeçalho `Origin`.

## Proteções revisadas e mantidas

Tokens de 256 bits gerados com `crypto`, persistidos apenas como SHA-256; finalidade e expiração verificadas no servidor; consumo atômico de uso único. Verificação expira em 24 horas e recuperação em 30 minutos. Reemissão substitui o token anterior; falhas de entrega preservam o anterior somente quando a compensação ainda é segura. Troca de senha revoga todas as sessões e exige novo login. Login revalida a versão da senha antes de criar uma sessão para não sobreviver a um reset concorrente.

Cookies de sessão são `HttpOnly`, `SameSite=Lax`, `Secure` em produção e restritos ao host/caminho. Sessões têm prazo fixo de oito horas ou sete dias com a opção de permanecer conectado. Recuperação/reenvio usam mensagem genérica, inclusive para limites excedidos, contas inexistentes e falhas do provedor. Abrir um link não consome tokens; confirmação exige POST. Novos links levam o token no fragmento, removido do endereço antes de ser enviado em JSON.

Identidade e restaurante são obtidos da sessão no servidor. Consultas de recursos incluem o restaurante; alterações exigem vínculo ativo e papel/autoria compatível, revalidados em transações. Listagens usam projeções explícitas e não retornam hashes de senha, sessão ou tokens. O domínio compartilha leitura financeira entre membros do mesmo restaurante por decisão do produto; contas de restaurantes diferentes não compartilham esses dados. SQL usa parâmetros para entradas; nomes de tabelas/colunas interpolados vêm de listas internas fixas, nunca de texto do cliente.

## Limites atuais

| Operação | Limite |
| --- | --- |
| Login | 5/e-mail/15 min; 300 globais/min; 100/IP confiável/min |
| Cadastro | 5/e-mail/hora; 30 globais/min; 20/IP confiável/hora |
| Pedir recuperação ou reenvio | 120 globais/min por finalidade; 20/IP confiável/hora por finalidade; resposta genérica |
| Concluir recuperação ou confirmação | 120 globais/min por finalidade; 30/IP confiável/15 min por finalidade |
| E-mails por destinatário/finalidade | Intervalo de 60 s e 3 solicitações/15 min, incluindo cadastro |
| Envio global | 2/s, 15/min e 100/janela fixa de 24 h; até 2 simultâneos/processo; timeout de 10 s |
| Processamento após resposta | Até 4 simultâneos/processo e 60 globais/min |
| Bcrypt | Até 8 simultâneos/processo |
| Exportações, incluindo faturamento | 60/usuário/min e 2 simultâneas/processo |
| Convites | 30/usuário/hora |
| Excluir restaurante ou período de gastos | 5/usuário/15 min, em contadores separados |
| Leitura administrativa | 60/administrador/min |
| Mutação administrativa com senha | 30/administrador/15 min |

Contadores são atômicos e compartilhados no PostgreSQL, com chaves em hash. As janelas são fixas, não deslizantes; tentativas e falhas também podem consumir cotas. Os limites por IP dependem de `TRUSTED_CLIENT_IP_HEADER` em ingresso que sobrescreva esse cabeçalho e bloqueie acesso direto. Os globais funcionam sem essa configuração. Não existe fila durável; encerramento do processo ou saturação pode exigir reenvio pelo usuário.

## Validação

Validação final: `npm run build`, `npm run lint`, `npm run typecheck` e `npm test` aprovados. A suíte completa executou 169 testes, sem falhas, cancelamentos ou testes ignorados. `git diff --check` também passou. Evidências locais: `reports/appsec-build.log`, `reports/appsec-tests.log` e `reports/appsec-production-dependencies.json` (artefatos ignorados pelo Git). Testes HTTP usam schemas PostgreSQL descartáveis; o transporte Resend é simulado, sem envio real nem consumo de cota externa. Incluem isolamento entre restaurantes, autorização administrativa, tokens concorrentes/expirados/reutilizados, falhas do provedor, limites distribuídos, cadastro genérico, proteção de imports e troca concorrente de senha durante exclusão.

## Dependências e produção

`npm audit --omit=dev` não encontrou vulnerabilidades publicadas nas dependências de produção nesta execução. A auditoria completa aponta 14 entradas transitivas de desenvolvimento associadas ao mesmo alerta de ReDoS de `picomatch`, usado pela cadeia de lint. A versão publicada atual (4.0.7) continua afetada e o [aviso oficial](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) informa ausência de versão corrigida. Não foi aplicado downgrade incompatível do Next nem correção cosmética que apenas escondesse o aviso; padrões glob fornecidos por usuários da aplicação não alcançam essa cadeia. É necessário atualizar quando houver correção upstream.

Para produção continuam necessários HTTPS, variáveis privadas no servidor, domínio/remetente Resend verificado, configuração de IP confiável, permissões mínimas no banco, proteção de credenciais, logs sem segredos e backups testados. A revisão não comprovou essas configurações externas nem entrega em caixa de e-mail real. A política existente de senha mínima de seis caracteres e a ausência de MFA foram preservadas; use senha longa e exclusiva na conta administrativa e MFA nos serviços de infraestrutura e e-mail. Uma política de senha mais forte e MFA na aplicação são evoluções recomendadas.

Referências: [TLS no node-postgres](https://node-postgres.com/features/ssl), [conexões seguras Neon](https://neon.com/docs/connect/connect-securely) e guias da versão instalada do Next em `node_modules/next/dist/docs/`.


## Arquivos alterados

- Cadastro e aviso: `src/app/api/v1/auth/register/route.ts`, `src/app/(auth)/register/FormRegister.tsx`, `src/components/EmailConfirmationNotice.tsx`.
- Identidade e administrador: `src/lib/auth.ts`, `src/lib/platform-owner.ts`, `src/lib/platform-admin.ts`, `src/app/(system)/admin/page.tsx`.
- Tipos públicos: `src/lib/platform-shared.ts`, `src/models/Platform.ts`, `src/app/(system)/admin/AdminPanel.tsx`.
- Recuperação e limites: `src/lib/account-recovery.ts`, `src/lib/auth-token-routes.ts`, `src/lib/security-limits.ts`, `src/app/api/v1/revenue/route.ts`.
- Fronteiras e conexão: `src/lib/auth-email.ts`, `src/lib/db.ts`, `src/lib/database-options.ts`, `src/models/RefreshToken.ts`.
- Exclusões e validação: `src/lib/reauthentication.ts`, `src/lib/expenses.ts`, `src/app/api/v1/company/route.ts`, `src/app/api/v1/company/switch/route.ts`, `src/app/api/v1/expenses/route.ts`, `src/lib/request-origin.ts`.
- Testes: `tests/auth.test.ts`, `tests/platform-admin.test.ts`, `tests/platform-owner.test.ts`, `tests/request-origin.test.ts`, `tests/security-auth-links.test.ts`, `tests/database-options.test.ts`, `tests/server-boundaries.test.ts`.
- Execução dos scripts com `server-only`: `package.json`, `package-lock.json`, `scripts/verify-financial-roundtrip.ts`, `tests/demo-history.test.ts`, `tests/restaurant-demo.test.ts`.
- Documentação: `README.md`, `docs/architecture.md`, este arquivo.
