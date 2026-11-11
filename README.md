# Controle Financeiro

Sistema para organizar a gestão financeira de restaurantes, pensado para acompanhar gastos com alimentos, funcionários e despesas da operação.

## Como funciona

- **Dono do restaurante:** cria sua conta, cadastra o restaurante e administra a equipe.
- **Convites:** o dono informa o e-mail de um funcionário, gera um link pessoal e o compartilha com ele. Não há envio automático de e-mail.
- **Funcionários:** abrem o convite, criam uma conta ou entram com uma conta existente e passam a fazer parte do restaurante.
- **Acessos individuais:** cada pessoa usa seu próprio e-mail e senha. A senha deve ter pelo menos 6 caracteres.
- **Mais de um restaurante:** uma conta pode participar de diferentes restaurantes e alternar entre eles no painel.

A central financeira reúne o resumo dos gastos, valores pagos e a pagar, média diária e gráficos de evolução e categorias. Use o seletor de ano ou as datas para consultar períodos, categorias e situações de pagamento. No gráfico de categorias, clique ou toque em uma fatia para ver seu nome, valor e percentual.

Em **Novo gasto**, informe descrição, valor, data e categoria. Você também pode registrar o local de compra ou favorecido, a forma de pagamento e observações. Há categorias para alimentos, funcionários, produtos, bebidas, embalagens, contas, manutenção, impostos e outros gastos.

O detalhamento de produtos é opcional: em **O que você comprou?**, adicione nome, quantidade, unidade e valor total de cada produto (até 50 por compra). Use **Usar soma dos produtos como valor da compra** para preencher o total. Você pode detalhar apenas parte da compra; o restante aparece como **Sem detalhamento**. A soma dos produtos não pode superar o valor da compra.

Em **Compras por produto**, consulte as quantidades e valores de todo o período filtrado, inclusive além da página atual de lançamentos. O gráfico de rosca mostra a participação no valor detalhado, as barras destacam os produtos de maior custo e o gráfico de evolução acompanha todos os itens ou um produto selecionado. Clique em uma fatia ou barra, ou escolha um produto no seletor, para consultar sua evolução. Os gastos sem detalhamento aparecem separados e não são atribuídos a ingredientes.

A área **Cadastros** reúne categorias, locais e produtos. Cada restaurante começa com 27 itens básicos, como arroz, feijão, carnes, hortifruti, óleo, limpeza e embalagens. No lançamento, digite para buscar (com ou sem acento), selecione uma sugestão ou use **Cadastrar** para incluir um novo produto para toda a equipe. A unidade sugerida é preenchida ao selecionar o item e pode ser ajustada na compra. Produtos têm identificação própria: renomeá-los mantém os totais e arquivá-los preserva as compras anteriores. Quantidades em kg, g, pacotes etc. continuam separadas na tabela; os gráficos somam o valor gasto no produto em todas as unidades. Compras representam aquisições, sem controle de estoque ou consumo da cozinha.

A busca geral também encontra os produtos de uma compra. CSV preserva os detalhes e a importação associa os produtos ao cadastro do restaurante de destino, cadastrando itens ausentes. Excel inclui uma aba **Produtos**. Para atualizar um banco existente, execute `npm run db:migrate` antes de iniciar esta versão: os itens antigos serão vinculados ao cadastro, preservando os valores e a ordem da compra.

Na área **Lançamentos**, consulte e exporte os dados filtrados em CSV ou Excel. O CSV apresenta datas como texto legível (`Data: 30/10/2026`); a planilha Excel tem datas, valores e larguras de coluna formatados. Funcionários podem editar e excluir os próprios gastos; o dono pode administrar todos os lançamentos do restaurante. A área **Equipe** mantém os convites e os acessos individuais. O dono pode remover funcionários: o acesso ao restaurante é revogado e os gastos anteriores continuam identificados com o nome de quem os lançou.

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

### Importar lançamentos e gerar um resumo

Use **Importar gastos CSV** para baixar um modelo, escolher seu arquivo e conferir a prévia. As colunas Data, Descrição, Valor e Categoria são obrigatórias; local, situação, pagamento e observações são opcionais. São aceitos ponto e vírgula, vírgula e tabulação como separadores, datas em `dd/mm/aaaa` ou `aaaa-mm-dd` e valores como `125,90`. O arquivo pode conter até 2.000 lançamentos e 2 MB. Corrija os erros indicados por linha antes de confirmar. Os novos gastos serão registrados em seu nome; reenvios do mesmo arquivo e IDs já identificados são ignorados. A importação adiciona registros e preserva os existentes.

Na aba **Faturamento**, o dono informa a soma dos pedidos de cada dia. O CSV de faturamento usa uma linha por data, com as colunas Data e Faturamento. A importação preserva valores já cadastrados e a edição manual permite corrigi-los. A aba **Lucro**, a planilha, o Excel e o PDF comparam o faturamento informado com todos os gastos do período. Dias sem faturamento cadastrado ficam em branco na comparação diária e tornam o resultado do período parcial.

O botão **Gerar PDF** baixa um resumo do período e dos filtros aplicados, com totais, pagamentos, evolução dos gastos e distribuição por categoria. Não há limite de 366 dias para consultar o painel: use **Todo o período** ou defina as datas. Os gráficos usam dias, meses ou anos conforme o intervalo para manter a leitura simples.


### Exemplos para conferir o painel

Para carregar compras fictícias no restaurante administrado por uma conta existente, execute:

```sh
node --env-file-if-exists=.env --import tsx scripts/seed-demo-data.ts EMAIL_DA_CONTA
```

O comando adiciona até 16 gastos nas últimas semanas, com produtos, unidades, valores, situações de pagamento e lançamentos sem detalhamento. Eles recebem o selo **Exemplo** e observações indicando que são fictícios. A execução novamente no mesmo mês não duplica os exemplos. Os valores entram nos totais do restaurante escolhido. Os gastos existentes são preservados.

No painel, **O ritmo dos gastos** aparece primeiro. Em seguida, **Evolução das compras detalhadas** fica ao lado de **O peso de cada produto** em telas maiores; no celular, os gráficos ficam um abaixo do outro. Em **Cadastros**, as três listas têm altura uniforme, busca e rolagem independente.


Na aba **Lançamentos**, o painel exibe **O ritmo dos gastos** e a lista dos lançamentos. Os gráficos e totais por produto ficam na **Visão geral**. O detalhamento opcional continua disponível ao cadastrar ou editar uma compra.
