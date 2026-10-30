# Controle Financeiro

Sistema para organizar a gestão financeira de restaurantes, pensado para acompanhar gastos com alimentos, funcionários e despesas da operação.

## Como funciona

- **Dono do restaurante:** cria sua conta, cadastra o restaurante e administra a equipe.
- **Convites:** o dono informa o e-mail de um funcionário, gera um link pessoal e o compartilha com ele. Não há envio automático de e-mail.
- **Funcionários:** abrem o convite, criam uma conta ou entram com uma conta existente e passam a fazer parte do restaurante.
- **Acessos individuais:** cada pessoa usa seu próprio e-mail e senha. A senha deve ter pelo menos 6 caracteres.
- **Mais de um restaurante:** uma conta pode participar de diferentes restaurantes e alternar entre eles no painel.

A central financeira reúne o resumo dos gastos, valores pagos e a pagar, média diária e gráficos de evolução e categorias. Use os filtros para consultar períodos, categorias e situações de pagamento.

Em **Novo gasto**, informe descrição, valor, data e categoria. Você também pode registrar o local de compra ou favorecido, a forma de pagamento e observações. Há categorias para alimentos, funcionários, produtos, bebidas, embalagens, contas, manutenção, impostos e outros gastos.

Na área **Lançamentos**, consulte e exporte os dados filtrados em CSV. Funcionários podem editar e excluir os próprios gastos; o dono pode administrar todos os lançamentos do restaurante. A área **Equipe** mantém os convites e os acessos individuais. O dono pode remover funcionários: o acesso ao restaurante é revogado e os gastos anteriores continuam identificados com o nome de quem os lançou.

## Como iniciar o projeto

### Requisitos

- Node.js 22.16 ou superior.
- npm.
- PostgreSQL 14 ou superior, com um banco criado e o serviço em execução.

Execute os comandos na pasta do projeto.

### 1. Instalar as dependências

```sh
npm ci
```

### 2. Configurar o ambiente

Se ainda não existir um arquivo `.env`, copie `.env.example` para `.env`. No PowerShell:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

No `.env`, configure `DATABASE_URL` com a conexão do seu banco PostgreSQL, por exemplo `postgresql://usuario:senha@localhost:5432/controle_financeiro`. Se a senha contiver caracteres especiais, codifique-os para uso em uma URL. Para acessar pelo computador e pelo celular na mesma rede, deixe `APP_ORIGIN` sem definição no `.env`.

### 3. Preparar o banco e iniciar a aplicação

```sh
npm run db:migrate
npm run dev
```

O comando aplica o `schema.sql` ao banco informado em `DATABASE_URL`, criando as tabelas e os índices que ainda não existem. Ele não cria o banco PostgreSQL nem importa dados de arquivos SQLite antigos. Se o schema já foi aplicado, você pode executar o comando novamente.

Abra [http://localhost:3000](http://localhost:3000), crie a conta do dono e cadastre o restaurante. Depois, use o painel para convidar os funcionários.

### Acessar pelo celular

Conecte o celular à mesma rede Wi-Fi do computador e abra `http://IP_DO_COMPUTADOR:3000`, substituindo `IP_DO_COMPUTADOR` pelo endereço local da máquina.

Para compartilhar convites com o celular, gere os links acessando o sistema por esse mesmo endereço. Não use `localhost` no link compartilhado, pois ele aponta para o próprio dispositivo.

Se o IP do computador mudar, reinicie a aplicação. Para parar o servidor, pressione `Ctrl+C`; para iniciá-lo novamente, execute `npm run dev`.

### Testar com dados de exemplo

Com `ENABLE_DEMO_DATA=true` no `.env`, o dono vê os controles **Restaurar exemplos** e **Excluir exemplos** no painel e na lista de lançamentos. São 54 gastos fictícios entre o mês atual e o anterior, identificados com a etiqueta **Exemplo**. Restaurar recompõe os exemplos e desfaz alterações feitas neles; excluir retira somente esses registros. Os gastos reais são preservados. Para ocultar os controles, defina `ENABLE_DEMO_DATA=false` e reinicie a aplicação.
