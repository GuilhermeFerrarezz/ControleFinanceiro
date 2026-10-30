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
APP_ORIGIN=http://localhost:3000
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
- Senhas novas exigem 12 caracteres e no máximo 72 bytes UTF-8 (limite do bcrypt). Senhas antigas continuam funcionando. Payloads JSON são limitados a 8 KiB.
- O cadastro público sempre cria uma nova empresa e seu administrador. Não permite escolher papel ou entrar em empresa alheia. Convites de colaboradores, recuperação de senha e provedores sociais ainda não estão implementados e não aparecem como ações disponíveis.
- Novas operações financeiras devem obter o usuário com `currentUser()`, exigir empresa vinculada, filtrar toda consulta por `empresaId` da sessão e verificar `papel` conforme a operação. O endpoint privado atual retorna apenas a identidade autenticada, sem dados financeiros.

## Produção

Use armazenamento persistente para o arquivo SQLite e execute uma instância da aplicação. Não use filesystem temporário de funções serverless para o banco. Migração para PostgreSQL e coordenação de múltiplas instâncias precisam de implementação específica; dependências PostgreSQL não utilizadas foram removidas.

Instale as dependências de desenvolvimento no estágio de build; elas podem ser omitidas no estágio de execução. `bcryptjs` é dependência de produção. A ferramenta de migração utiliza `tsx`, portanto execute-a no estágio de implantação que mantém as dependências de desenvolvimento.

As dependências foram atualizadas para corrigir os avisos do npm audit. O override `sequelize > uuid@11.1.1` evita a versão vulnerável e mantém CommonJS; [uuid 12 remove esse suporte](https://github.com/uuidjs/uuid). Reavalie o override ao atualizar o Sequelize.

Não registre senhas, hashes ou identificadores de sessão. Use backups protegidos e revise periodicamente `npm audit`.
