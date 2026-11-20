# Controle Financeiro

Para configurar o acesso exclusivo ao painel `/admin`, os limites globais e a suspensão de restaurantes/usuários, consulte [Administração da plataforma](docs/platform-admin.md).

Para ativar backups diários criptografados do Neon no GitHub Actions e testar a restauração, siga [Backups do banco](docs/backups.md). A rotina só executa na `main` e requer configuração no GitHub; o deploy na Vercel não a ativa sozinho.

Sistema para organizar a gestão financeira de restaurantes, pensado para acompanhar gastos com alimentos, funcionários e despesas da operação.

## Como funciona

- **Dono do restaurante:** cria sua conta, cadastra o restaurante e administra a equipe.
- **Convites:** o dono informa o e-mail de um funcionário, gera um link pessoal e o compartilha com ele. Não há envio automático de e-mail.
- **Funcionários:** abrem o convite, criam uma conta ou entram com uma conta existente e passam a fazer parte do restaurante.
- **Acessos individuais:** cada pessoa usa seu próprio e-mail e senha. Novas senhas exigem pelo menos 8 caracteres, uma letra maiúscula e um símbolo, inclusive ao recuperar a conta. Senhas antigas continuam válidas para login.
- **Mais de um restaurante:** uma conta pode participar de diferentes restaurantes e alternar entre eles no painel.
- **Confirmação de e-mail:** confirme em até 7 dias após o cadastro para manter o acesso. Após esse prazo, o acesso fica bloqueado até confirmar; é possível solicitar um novo link público, válido por 24 horas. Recuperar a senha não elimina esse bloqueio.

A central financeira reúne o resumo dos gastos, valores pagos e a pagar, média diária e gráficos de evolução e categorias. Use o seletor de ano ou as datas para consultar períodos, categorias e situações de pagamento. No gráfico de categorias, clique ou toque em uma fatia para ver seu nome, valor e percentual.

Em **Novo gasto**, informe descrição, valor, data e categoria. Você também pode registrar o local de compra ou favorecido, a forma de pagamento e observações. Há categorias para alimentos, funcionários, produtos, bebidas, embalagens, contas, manutenção, impostos e outros gastos.

O detalhamento de produtos é opcional: em **O que você comprou?**, adicione nome, quantidade, unidade e valor total de cada produto (até 50 por compra). Use **Usar soma dos produtos como valor da compra** para preencher o total. Você pode detalhar apenas parte da compra; o restante aparece como **Sem detalhamento**. A soma dos produtos não pode superar o valor da compra.

Em **Compras por produto**, consulte as quantidades e valores de todo o período filtrado, inclusive além da página atual de lançamentos. O gráfico de rosca mostra a participação no valor detalhado, as barras destacam os produtos de maior custo e o gráfico de evolução acompanha todos os itens ou um produto selecionado. Clique em uma fatia ou barra, ou escolha um produto no seletor, para consultar sua evolução. Os gastos sem detalhamento aparecem separados e não são atribuídos a ingredientes.

A área **Cadastros** reúne categorias, locais e produtos. Cada restaurante começa com 27 itens básicos, como arroz, feijão, carnes, hortifruti, óleo, limpeza e embalagens. No lançamento, digite para buscar (com ou sem acento), selecione uma sugestão ou use **Cadastrar** para incluir um novo produto para toda a equipe. A unidade sugerida é preenchida ao selecionar o item e pode ser ajustada na compra. Produtos têm identificação própria: renomeá-los mantém os totais e arquivá-los preserva as compras anteriores. A análise de insumos reúne kg/g em kg e L/ml em L. Pacotes e caixas só são convertidos se o conteúdo tiver sido informado na compra; os demais permanecem separados. Os gráficos de gastos somam o custo do produto em todas as unidades. A aba **Estoque** controla o saldo dos mesmos produtos cadastrados. Ao cadastrar um produto, é possível ativar o controle, informar saldo inicial, estoque mínimo, local de armazenamento e fornecedores principais. Também é possível ativar produtos existentes na própria aba de estoque.

Em cada item de uma compra, marque **Adicionar esta quantidade ao estoque** quando o produto for recebido. A entrada é integrada ao lançamento: editar quantidade ou excluir uma compra corrige o saldo, e a operação é bloqueada se causar estoque negativo. Compras antigas não entram automaticamente no estoque. Na aba **Estoque**, registre consumo, perdas, entradas avulsas e contagens físicas com data, motivo e responsável. Movimentações manuais não são apagadas; para corrigir, registre uma nova entrada ou contagem. As entradas avulsas alteram apenas o saldo, sem criar gastos.

O estoque mostra alertas de reposição, histórico com filtro por produto e os fornecedores encontrados nas compras. O preço médio é ponderado: total gasto dividido pela quantidade comprada, considerando compras ativas na unidade de controle, inclusive compras ainda não recebidas ou a pagar. O valor estimado é o saldo multiplicado por esse preço médio; itens sem compras ficam sem avaliação. Gramas e mililitros são convertidos para quilos e litros; pacotes e caixas precisam do conteúdo informado para serem convertidos. A unidade de controle fica fixa após ativação. O CSV preserva a indicação de recebimento dos itens; importar um arquivo pode gerar entradas no estoque.

A busca geral também encontra os produtos de uma compra. CSV preserva os detalhes e a importação associa os produtos ao cadastro do restaurante de destino, cadastrando itens ausentes. Excel inclui uma aba **Produtos**. Para atualizar um banco existente, execute `npm run db:migrate` antes de iniciar esta versão: os itens antigos serão vinculados ao cadastro, preservando os valores e a ordem da compra.

Na área **Lançamentos**, consulte e exporte os dados filtrados em CSV ou Excel. O CSV apresenta datas como texto legível (`Data: 30/10/2026`); a planilha Excel tem datas, valores e larguras de coluna formatados. Funcionários podem editar e excluir os próprios gastos; o dono pode administrar todos os lançamentos do restaurante. A área **Equipe** mantém os convites e os acessos individuais. O dono pode remover funcionários: o acesso ao restaurante é revogado e os gastos anteriores continuam identificados com o nome de quem os lançou.

## Como iniciar o projeto

As gravações de faturamento comparam o valor anterior antes de atualizar: uma aba desatualizada recebe conflito (409) e deve recarregar o dia, sem sobrescrever outra edição. Importações CSV preservam datas já cadastradas.

Prévias/importações de gastos e gravações/importações de faturamento compartilham uma proteção de 30 solicitações por usuário/minuto, 120 globais/minuto e duas operações simultâneas por processo. O limite é aplicado antes da leitura do corpo. As transações HTTP têm timeout de consulta de 30 segundos, espera por lock de 5 segundos e ociosidade transacional de 15 segundos, usando `SET LOCAL` para compatibilidade com o pooler do Neon. Migrações têm limites próprios (5 minutos por comando e 10 segundos por lock). Aplique `npm run db:migrate` antes desta versão para criar também o índice de expiração do rate limiter e a coluna do tutorial.

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

Para enviar e-mails no sandbox do Resend sem domínio próprio, configure no `.env`:

```dotenv
RESEND_API_KEY=sua_chave_privada
RESEND_SANDBOX_TO=seu-email-da-conta-resend@example.com
```

Com `RESEND_SANDBOX_TO` definido, todas as confirmações e recuperações são enviadas somente a essa caixa, usando `Saldo da Casa <onboarding@resend.dev>`. O assunto recebe `[Sandbox]` e o corpo identifica a conta solicitante; o token continua pertencendo à conta original. Use contas de teste enquanto esse redirecionamento estiver ativo. A variável é privada do servidor e não pode ser definida pelo formulário.

Os limites de 15 envios/minuto e 100 por janela fixa de 24 horas continuam ativos. Em desenvolvimento, o link usa o endereço local da aplicação; em produção, configure também `APP_ORIGIN` com sua URL pública HTTPS (pode ser a URL da Vercel). Reinicie o servidor após alterar o `.env`.

Quando tiver um domínio verificado no Resend, remova `RESEND_SANDBOX_TO` e defina `RESEND_FROM_EMAIL` com um remetente desse domínio. Os envios voltarão a usar o e-mail de cada conta. Consulte a [restrição oficial do sandbox](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Na Vercel, use o sandbox em **Preview**, com um banco separado das contas reais. O build de **Production** recusa o redirecionamento para uma caixa única porque ela receberia também os links de recuperação de senha de todos os clientes.

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
node --conditions=react-server --env-file-if-exists=.env --import tsx scripts/seed-demo-data.ts EMAIL_DA_CONTA
```

O comando adiciona até 16 gastos nas últimas semanas, com produtos, unidades, valores, situações de pagamento e lançamentos sem detalhamento. Eles recebem o selo **Exemplo** e observações indicando que são fictícios. A execução novamente no mesmo mês não duplica os exemplos. Os valores entram nos totais do restaurante escolhido. Os gastos existentes são preservados.

No painel, **O ritmo dos gastos** aparece primeiro. Em seguida, **Evolução das compras detalhadas** fica ao lado de **O peso de cada produto** em telas maiores; no celular, os gráficos ficam um abaixo do outro. Em **Cadastros**, as três listas têm altura uniforme, busca e rolagem independente.


Na aba **Lançamentos**, o painel exibe **O ritmo dos gastos** e a lista dos lançamentos. Os gráficos e totais por produto ficam na **Visão geral**. O detalhamento opcional continua disponível ao cadastrar ou editar uma compra.


### Arquivos grandes prontos para reimportar

Em **Lançamentos**, use **CSV em partes (ZIP)** para baixar o período filtrado em arquivos menores. Cada parte tem cabeçalho próprio, no máximo **2.000 gastos** e **2 MB em UTF-8**, contando acentos, aspas e detalhamento de produtos. Extraia o ZIP e importe um CSV de cada vez. Os IDs são preservados, mantendo a proteção contra duplicação e a restauração de registros excluídos.

O ZIP inclui um guia e um manifesto com quantidade, bytes e total em centavos por parte. Esta opção suporta até **100.000 lançamentos** e **64 MB de dados CSV** por solicitação; acima disso, reduza o período ou aplique filtros. O CSV único e o Excel continuam com limite de 10.000 gastos. Os registros do ZIP são lidos em lotes, a partir de um único snapshot consistente do banco.

### Preço e quantidade dos insumos

Em **Visão geral > Compras por produto**, a tabela **Quantidades e preços dos insumos** mostra quantidade convertida, custo total, preço médio ponderado, último preço e variação entre as duas últimas compras do período. Escolha um insumo para acompanhar o preço por kg, litro, unidade, pacote ou caixa ao longo do tempo. Cada ponto do gráfico também é ponderado pela quantidade; datas sem compras ficam em branco.

No cadastro do produto, escolha **pacote** ou **caixa** e, opcionalmente, informe seu conteúdo. Exemplo: pacote de arroz com **5 kg**, ou caixa com **12 un**. A seleção preenche essa sugestão na compra; o conteúdo pode ser ajustado para aquela compra específica. Duas embalagens de 5 kg equivalem a 10 kg para a análise. Alterar a sugestão no cadastro não muda compras antigas. Sem conteúdo informado, o sistema compara apenas o preço por pacote ou caixa, sem estimar peso ou volume.

O CSV e o ZIP preservam o conteúdo das embalagens em Produtos (JSON). No Excel, **Produtos** mantém os valores originais e acrescenta quantidade convertida e preço por medida; **Insumos** resume os totais e o preço ponderado. As conversões usam quantidades decimais exatas e o preço é arredondado apenas no resultado em centavos. A análise representa compras e não movimentações de estoque ou consumo da cozinha.


### Segurança de implantação

Configure HTTPS e `APP_ORIGIN` na implantação. Na Vercel, com a variável de sistema `VERCEL=1`, a aplicação lê automaticamente o IP de `x-vercel-forwarded-for`. Em outra hospedagem, configure `TRUSTED_CLIENT_IP_HEADER=x-forwarded-for` somente se o proxy substituir o cabeçalho por um único IP e impedir acesso direto ao servidor. Sem esse ingresso, mantenha a variável ausente. Os limites globais e por e-mail continuam ativos. [Cabeçalhos de requisição da Vercel](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for)

Login e cadastro têm limites por conta e concorrência bcrypt limitada. Exportações têm até duas operações simultâneas por processo e 60 solicitações por usuário/minuto. PDFs muito extensos e planilhas acima do orçamento de células/dados retornam uma orientação para reduzir o período ou usar CSV em partes. Limites por rede, timeouts, quotas de banco e proteção DDoS devem existir também no ingresso.


## Revisão de segurança

As alterações e os limites da auditoria atual estão em [Auditoria AppSec de 18/11/2026](docs/security-appsec-review-2026-11-18.md). Banco, envio de e-mail e identidade administrativa são protegidos com `server-only`; scripts Node avulsos que importam esses serviços devem usar `--conditions=react-server`, como nos exemplos acima. Os comandos npm já incluem essa condição.
