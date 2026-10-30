# Controle financeiro para restaurantes

Projeto Next.js com cadastro de restaurante e administrador, login e sessões no servidor. Os módulos financeiros ainda estão em desenvolvimento.

## Desenvolvimento

Requisitos: Node.js 22.16 ou superior e npm. Execute os comandos na raiz do projeto:

```sh
npm ci
```

Copie `.env.example` para `.env` e ajuste os valores:

```dotenv
DATABASE_STORAGE=./database.sqlite
# Opcional em produção, quando houver domínio público/proxy:
# APP_ORIGIN=https://financeiro.exemplo.com
```

Em seguida:

```sh
npm run db:migrate
npm run dev
```

Abra http://localhost:3000. O cadastro cria, na mesma transação, um restaurante e seu administrador. Contas antigas sem restaurante são encaminhadas para a configuração inicial. Os antigos segredos JWT não são mais utilizados.

## Verificação

```sh
npm run lint
npm run typecheck
npm run build
npm test
```

Os testes HTTP precisam de um build atualizado e iniciam um servidor de produção em uma porta livre. Usam banco temporário, verificam cadastro, validação, normalização de e-mail, cookies, CSRF, isolamento entre restaurantes, sessões simultâneas, bloqueio de restaurante inativo, expiração, limite de tentativas e revogação no logout. Também verificam a migração em uma cópia do banco local, quando disponível. O banco original não é utilizado pelo servidor de testes.

O build usa webpack explicitamente. A versão anterior do projeto ficava sem concluir a compilação com Turbopack neste ambiente. Não há download de fontes externas durante o build.

## Banco e migrações

`npm run db:migrate` aplica migrações versionadas e idempotentes, sem `sync({ alter: true })`. Pare a aplicação e faça backup antes de migrar um banco com dados importantes.

O comando também cria automaticamente uma cópia consistente do banco existente em `.backups/`, antes de aplicar qualquer migração.

A primeira migração mantém empresas e usuários existentes, converte `usuarios.empresaId` para UUID, normaliza e-mails e cria índices, sessões e limites de tentativas. E-mails que colidem após a normalização ou referências inválidas cancelam a migração inteira para permitir correção manual. Sessões JWT antigas são revogadas; os usuários precisam entrar novamente.

O arquivo SQLite e os backups ficam fora do Git. Remover o arquivo do índice não apaga versões já presentes no histórico: cópias históricas devem ser tratadas como dados sensíveis. Nenhuma reescrita de histórico é feita automaticamente.

## Autenticação e autorização

- O navegador recebe somente um identificador aleatório de 256 bits em cookie `session`, `HttpOnly`, `SameSite=Lax` e `Secure` em produção. Apenas o SHA-256 do identificador fica no banco.
- Sem “Lembre-me”, o cookie dura a sessão do navegador e a sessão no servidor tem limite de 8 horas. Com a opção, ambos têm limite fixo de 7 dias. Navegadores podem restaurar cookies de sessão ao restaurar janelas; o limite no servidor continua valendo.
- Logout revoga imediatamente a sessão correspondente. Sessões em outros navegadores continuam válidas. Não há JWT ou token de autenticação no `localStorage`; chaves antigas são removidas pela interface.
- `/api/v1/auth/refresh` permanece como consulta autenticada de compatibilidade, sem renovar ou prolongar a sessão. O frontend não precisa chamá-lo.
- Proxy faz os redirecionamentos e remove cookies inválidos. Páginas e endpoints protegidos verificam novamente a sessão no servidor. Identidade e restaurante nunca são aceitos de headers, corpo ou armazenamento do navegador.
- Requisições de escrita verificam `Origin` e `Sec-Fetch-Site`. Configure `APP_ORIGIN` com a origem pública exata em produção, por exemplo `https://financeiro.exemplo.com`, e use HTTPS.
- Login: até 5 tentativas por e-mail normalizado em 15 minutos e 100 tentativas globais por minuto. Cadastro: até 20 requisições globais por hora. Os contadores são persistidos no SQLite; não dependem de headers de IP que um cliente possa falsificar. Limites globais incluem requisições inválidas. Em uma implantação pública maior, complemente com limitação de tráfego no proxy de entrada.
- Senhas novas exigem 6 caracteres e no máximo 72 bytes UTF-8 (limite do bcrypt). Senhas antigas continuam funcionando. Payloads JSON são limitados a 8 KiB.
- O cadastro público sempre cria uma nova empresa e seu administrador. Não permite escolher papel ou entrar em empresa alheia. O dono gera convites pessoais por link para funcionários. Recuperação de senha e provedores sociais ainda não estão implementados e não aparecem como ações disponíveis.
- Novas operações financeiras devem obter o usuário com `currentUser()`, exigir empresa vinculada, filtrar toda consulta por `empresaId` da sessão e verificar `papel` conforme a operação. O endpoint privado atual retorna apenas a identidade autenticada, sem dados financeiros. O papel vem de `restaurant_members`, não dos campos antigos do usuário.

## Produção

Use armazenamento persistente para o arquivo SQLite e execute uma instância da aplicação. Não use filesystem temporário de funções serverless para o banco. Migração para PostgreSQL e coordenação de múltiplas instâncias precisam de implementação específica; dependências PostgreSQL não utilizadas foram removidas.

Instale as dependências de desenvolvimento no estágio de build; elas podem ser omitidas no estágio de execução. `bcryptjs` é dependência de produção. A ferramenta de migração utiliza `tsx`, portanto execute-a no estágio de implantação que mantém as dependências de desenvolvimento.

As dependências foram atualizadas para corrigir os avisos do npm audit. O override `sequelize > uuid@11.1.1` evita a versão vulnerável e mantém CommonJS; [uuid 12 remove esse suporte](https://github.com/uuidjs/uuid). Reavalie o override ao atualizar o Sequelize.

Não registre senhas, hashes ou identificadores de sessão. Use backups protegidos e revise periodicamente `npm audit`.

## Restaurante e equipe

A página inicial apresenta o Controle Financeiro. O dono cria seu restaurante no cadastro e administra os convites no painel. Funcionários entram pelo link pessoal, criam uma conta ou usam a existente, e passam a participar do restaurante. Os links são copiados e compartilhados manualmente; não há envio de e-mail automático. Uma pessoa pode participar de mais de um restaurante e alternar o contexto no painel.

Depois de atualizar o projeto, execute `npm run db:migrate` antes de iniciá-lo. A migração 002 preserva os vínculos existentes e cria a estrutura de membros e convites.

Veja [a arquitetura de contas, restaurantes e convites](docs/architecture.md). O lançamento de gastos permanece fora desta etapa.

### Convites pelo celular na mesma rede Wi-Fi

Inicie a aplicação e abra, no celular, `http://IP_DO_COMPUTADOR:3000`. Gere e compartilhe o convite usando esse mesmo endereço; `localhost` no celular aponta para o próprio celular. Em desenvolvimento local, deixe `APP_ORIGIN` sem definição para aceitar a origem do endereço acessado. Se houver um domínio público ou proxy em produção, defina `APP_ORIGIN` com a origem HTTPS exata.

A validação compara a origem do navegador com o header `Host` da requisição, pois a URL interna do Next.js pode continuar sendo localhost ao acessar pelo IP. Headers `X-Forwarded-Host` enviados por clientes não ampliam as origens aceitas.

O modo de desenvolvimento também permite automaticamente o HMR nos IPs privados das interfaces de rede do próprio computador, por meio de `allowedDevOrigins`. Isso evita o recarregamento contínuo ao abrir convites pelo Wi-Fi. Se o IP mudar ou você alterar `next.config.ts`, pare e inicie novamente `npm run dev`. A permissão é limitada aos endereços locais detectados e não usa curingas para liberar qualquer origem.
