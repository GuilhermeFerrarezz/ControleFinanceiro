# Auditoria AppSec e correções — 14/11/2026

## Escopo e limites

Base auditada: commit `58ae7ba` mais os arquivos locais presentes no início da análise. Inventário inicial: **176 arquivos**, incluindo **18 rotas de API**, proxy, páginas, componentes, bibliotecas, modelos, scripts, testes, configurações e recursos estáticos. Inventário por arquivo no apêndice. Foram rastreados os fluxos sensíveis manualmente e pesquisados padrões de source/sink nos arquivos textuais. Fontes e imagens foram inventariadas como ativos, não como código executável. `node_modules`, `.next`, relatórios e PDFs gerados não são código autoral; dependências foram avaliadas pelo lockfile e pelo npm audit.

O histórico Git acessível foi pesquisado em **575 blobs textuais** por padrões de senhas em URLs PostgreSQL, chaves privadas, tokens GitHub e chaves OpenAI. Não houve correspondências não exemplificativas. Essa pesquisa heurística não prova ausência de qualquer segredo; não cobre commits inalcançáveis nem segredos no provedor de hospedagem. O `.env` local está fora do Git; seus valores não foram impressos ou copiados para o relatório.

Não houve teste destrutivo no banco do restaurante. Testes HTTP, concorrência e autorização usam schemas temporários. Não foram inferidas vulnerabilidades de produção a partir de infraestrutura que não está neste repositório. A análise reduz riscos confirmados; não equivale a certificação de ausência de todas as vulnerabilidades.

## Falhas confirmadas e corrigidas

- **[SEVERIDADE: MÉDIA] — Bloqueio global de login e cadastro por consumo de cotas compartilhadas [CORRIGIDA]**
  - **Localização:** `src/app/api/v1/auth/login/route.ts` (linhas 17–24), `src/app/api/v1/auth/register/route.ts` (linhas 16–26), `src/lib/security-limits.ts` (linhas 11–32), `src/lib/rate-limit.ts` (linhas 3–18).
  - **Categoria:** OWASP A04 — falha de desenho / CWE-770, negação de serviço lógico.
  - **Análise Técnica & Vetor de Ataque:** antes do patch, uma pessoa sem sessão podia enviar 100 tentativas de login por minuto ou 20 solicitações de cadastro por hora. Os contadores `login:global` e `register:global` eram compartilhados. Depois disso, credenciais válidas de outras pessoas e novos cadastros eram recusados até a janela expirar. Não era necessário descobrir senha ou obter acesso a outro restaurante.
  - **Impacto:** indisponibilidade da autenticação para usuários não relacionados ao atacante, com bloqueio persistente até o fim da janela.
  - **Correção Aplicada:** removida a decisão de autorização baseada nas cotas globais. Mantidos limites atômicos por e-mail no login e acrescentado limite por e-mail no cadastro. Custos bcrypt limitados a oito operações simultâneas por processo, com liberação em `finally` e resposta 429 sem bloqueio persistente. Limite adicional por IP fica disponível somente quando um proxy explicitamente confiável sobrescreve `TRUSTED_CLIENT_IP_HEADER`; cabeçalhos encaminhados arbitrários são ignorados. Contadores saturam em limite+1 para evitar overflow e a limpeza não depende mais de uma chave global. Teste HTTP esgota as antigas chaves e comprova que outra conta pode cadastrar e entrar.

- **[SEVERIDADE: MÉDIA] — Exportações e relatórios sem orçamento proporcional de processamento [CORRIGIDA]**
  - **Localização:** `src/lib/security-limits.ts` (linhas 34–41), `src/lib/dashboard-pdf.ts` (linhas 11–16), `src/lib/expense-workbook.ts` (linhas 8–13); integração em `src/app/api/v1/expenses/route.ts`, `src/app/api/v1/expenses/report/route.ts` e `src/app/api/v1/expenses/sheet/route.ts`.
  - **Categoria:** OWASP A04 — consumo assimétrico de recursos / CWE-400 e CWE-770.
  - **Análise Técnica & Vetor de Ataque:** uma conta autenticada podia acumular muitos produtos e solicitar repetidamente PDF ou Excel do período amplo. O PDF criava gráficos para cada insumo e percorria a série completa para cada um; o Excel expandia todos os produtos por compra. O limite prévio por número de gastos não limitava essas dimensões nem a quantidade de arquivos produzidos ao mesmo tempo. Solicitações paralelas podiam multiplicar alocações de memória e CPU.
  - **Impacto:** lentidão, pressão de memória e indisponibilidade para outros restaurantes no mesmo processo. Exige conta e dados suficientes; não foi classificado como execução remota de código ou vazamento entre restaurantes.
  - **Correção Aplicada:** até duas exportações concorrentes por processo e 60 por usuário/minuto, verificadas antes de carregar os dados do arquivo. O PDF rejeita mais de 250 insumos ou custo de insumos × registros diários acima de 5 milhões. O Excel rejeita estimativa acima de 250 mil células ou mais de 16 MiB de dados de entrada. Limites prévios de ZIP, CSV e planilha foram preservados. Excessos retornam 429 ou erro validado 400 com orientação para reduzir o período ou usar ZIP. Testes verificam orçamento, isolamento da cota de exportação e continuidade da consulta normal ao painel.

- **[SEVERIDADE: MÉDIA] — Dependência de desenvolvimento afetada por amplificação de glob [CORRIGIDA]**
  - **Localização:** `package-lock.json` (linhas 2492–2505), `package.json` (linhas 43–45).
  - **Categoria:** OWASP A06 — componente vulnerável; CWE-405.
  - **Análise Técnica & Vetor de Ataque:** a cadeia `eslint-config-next → typescript-eslint → typescript-estree` instalava `minimatch@10.2.6`. O aviso GHSA-g3hv-75wg-m249 descreve padrões glob controlados por atacante que amplificam trabalho e memória em configurações afetadas. Para explorar neste contexto, é necessário controlar padrões consumidos pelas ferramentas de análise; não foi identificado caminho de uma entrada HTTP do sistema até esse sink. Os oito alertas npm eram efeitos da mesma dependência, não oito vulnerabilidades independentes.
  - **Impacto:** DoS nas ferramentas de desenvolvimento/CI quando a condição de controle do padrão se aplica. Não foi demonstrado impacto remoto no aplicativo de produção.
  - **Correção Aplicada:** override restrito a `@typescript-eslint/typescript-estree`, fixando `minimatch@11.0.8`, com lockfile e integridades atualizados. A versão do Next.js foi preservada. Instalação realizada com `--ignore-scripts`; lint, tipos, build e testes foram validados. `npm audit` passou de oito alertas moderados para zero alertas conhecidos.

Fonte primária: [aviso do mantenedor de minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249). A consulta npm registra o estado conhecido em 14/11/2026, não uma garantia futura.

## Reforços preventivos, não contados como vulnerabilidades exploráveis confirmadas

- CSP compatível com a aplicação: `object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`.
- HSTS em produção com `max-age=31536000`, sem impor `includeSubDomains` a domínios fora do escopo. Navegadores ignoram esse cabeçalho em HTTP; HTTPS e redirecionamento continuam sendo responsabilidade da implantação.
- Permissions-Policy desabilita câmera, microfone e geolocalização, que não são usados no sistema.
- A CSP adicionada não restringe `script-src` e não foi apresentada como correção de XSS. Uma política com nonce exigiria trabalho específico para os scripts de hidratação do Next.js.

## Resultado por categoria

1. **Autenticação, sessão e controle de acesso:** Nenhuma falha identificada nesta categoria após verificação. Sessões são tokens opacos aleatórios de 256 bits; o banco guarda SHA-256 e verifica expiração, restaurante ativo e vínculo. Não há JWT ativo para testar algoritmo `none`. Cookies de produção são HttpOnly, Secure e SameSite=Lax. Login substitui a sessão apresentada; logout e remoção de funcionário revogam sessões. Identidade e papel não vêm do corpo nem de headers do cliente. O problema de cotas de autenticação foi classificado em disponibilidade.
2. **Injeções e manipulação de entrada:** Nenhuma falha identificada nesta categoria após verificação. SQL de entrada utiliza parâmetros; trechos SQL dinâmicos são estruturas internas e os identificadores de schema dos testes têm allowlist. Não há `eval`, `innerHTML` ou `dangerouslySetInnerHTML` nos fontes. React apresenta texto escapado. URLs e processos de scripts não são sinks de entradas HTTP; `execFile` e `spawn` usam argumentos sem shell. Importações processam CSV limitado e JSON validado, não uploads executáveis, URLs remotas ou arquivos descompactados. CSV neutraliza fórmulas e XLSX usa texto tipado para valores textuais.
3. **Segredos, criptografia e configuração:** Nenhuma falha identificada nesta categoria após verificação. Não foi confirmado segredo real versionado nos padrões pesquisados. Bcrypt protege senhas; randomBytes gera sessões e convites; SHA-256 tem uso de hash de tokens, não de senha. Não foi encontrado CORS wildcard com credenciais nem stack trace retornado pelos handlers revisados. Cabeçalhos foram reforçados preventivamente, com os limites descritos acima.
4. **Lógica, concorrência e disponibilidade:** duas falhas corrigidas, descritas acima. Criação e mutação de gastos revalidam o vínculo na transação; versão e bloqueio de linha impedem edição perdida de gastos. Convites usam bloqueio e consumo atômico; importação usa transação, deduplicação e auditoria. Totais monetários e quantidades são validados no servidor; números em centavos têm checagem de intervalo. O reset de filtros arquivados é comportamento explícito coberto por testes, não foi reclassificado como IDOR. Não foram identificados pagamentos reais, cupons, saldos bancários, LDAP, XPath ou NoSQL.
5. **Cadeia de suprimentos e infraestrutura:** uma falha corrigida, descrita acima. Não há Dockerfile, workflow CI/CD ou política IAM no inventário; portanto não é possível inferir usuário root em contêiner, regras de nuvem ou permissões de produção a partir deste código.

## Configuração manual e riscos residuais

1. Configurar HTTPS e redirecionamento HTTP→HTTPS; definir `APP_ORIGIN` para a origem pública exata atrás do proxy.
2. Para limites por rede, configurar `TRUSTED_CLIENT_IP_HEADER=x-real-ip` somente se o ingresso sobrescrever o cabeçalho com o endereço real e bloquear acesso direto ao Next.js. Sem isso, o sistema mantém cota por e-mail e contenção bcrypt, mas não atribui uma identidade de rede confiável. Não confiar cegamente em X-Forwarded-For.
3. Aplicar limites de conexão, tamanho, taxa por IP, timeouts e proteção volumétrica no proxy/WAF; a contenção da aplicação não substitui defesa contra DDoS nem quotas de armazenamento. Em múltiplas réplicas, a cota por usuário é compartilhada no PostgreSQL, mas a concorrência máxima é por processo.
4. Separar o usuário PostgreSQL de runtime do usuário de migração/testes. Runtime não precisa de superuser nem CREATE SCHEMA. Aplicar TLS verificado em conexões remotas, backups e testes de restauração.
5. Remover variáveis JWT legadas não utilizadas do ambiente quando conveniente. Não há rotação obrigatória comprovada por esta auditoria. Se alguma credencial tiver sido exposta por canais fora do Git analisado, fazer rotação no provedor e revogar sessões afetadas.
6. A senha mínima de seis caracteres é um contrato existente, inclusive na interface e nos testes. Recomenda-se uma migração de política para senhas mais longas, confirmação de e-mail, recuperação de conta e MFA; a auditoria não alterou silenciosamente esse contrato.
7. Não publicar `reports/`, backups ou `.env`. Logs de produção devem evitar conteúdo de requisições, tokens e URLs completas de convite. CI deve usar `npm ci`, auditoria de dependências e banco descartável.

## Validação pós-correção

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- `npm test`: 120 testes aprovados, zero falhas.
- `npm audit`: zero alertas conhecidos após atualização; oito moderados antes.
- `git diff --check`: aprovado.
- Regressões cobrem autorização horizontal/vertical, autenticação, origem, restauração e deduplicação CSV, transações, concorrência, rate limiting, exportações e limites de processamento.

## Resumo Executivo

| Severidade | Falhas corrigidas |
| --- | ---: |
| Crítica | 0 |
| Alta | 0 |
| Média | 3 |
| Baixa | 0 |
| **Total** | **3** |

Prioridade de implantação: **(1)** retirar o bloqueio global de autenticação e configurar o ingresso; **(2)** implantar os limites de exportação e custo dos documentos; **(3)** usar o lockfile corrigido também no CI. Reforços de cabeçalhos não foram contados como novas vulnerabilidades sem vetor demonstrado.

## Arquivos modificados

- `.env.example`, `next.config.ts`, `package.json`, `package-lock.json`.
- `src/lib/security-limits.ts`, `src/lib/rate-limit.ts`, `src/lib/dashboard-pdf.ts`, `src/lib/expense-workbook.ts`.
- `src/app/api/v1/auth/login/route.ts`, `src/app/api/v1/auth/register/route.ts`.
- `src/app/api/v1/expenses/route.ts`, `src/app/api/v1/expenses/report/route.ts`, `src/app/api/v1/expenses/sheet/route.ts`.
- `tests/auth.test.ts`, `tests/security-limits.test.ts`.
- Este relatório, o inventário associado e a documentação de operação no README.
