# Cálculos financeiros

Revisão de código e testes em 07/11/2026. Escopo: entrada de valores, persistência,
totais, médias, percentuais, faturamento, lucro/prejuízo, períodos, filtros,
paginação, importações, gráficos e exportações CSV, XLSX e PDF. A revisão usa
dados sintéticos; não reconcilia os lançamentos reais com extratos ou documentos.

## Representação e limites

- Valores persistidos e transportados na API são inteiros em centavos.
- Cada gasto deve estar entre 1 e 9.999.999.999 centavos; faturamento diário
  aceita também zero. O banco e as entradas HTTP validam esses limites.
- Somas e subtrações usam `BigInt` internamente, com conversão para `number`
  somente quando o resultado cabe exatamente em `Number.MAX_SAFE_INTEGER`.
  Um resultado fora desse limite gera erro; nunca é devolvido arredondado.
- A formatação de moeda separa reais e centavos por operações inteiras.
  Assim, o total de 9.007.199.254.740.991 centavos aparece como
  R$ 90.071.992.547.409,91, sem perder o último centavo.

## Fórmulas e arredondamento

- Total = soma dos gastos ativos que correspondem ao período e aos filtros.
- Total = já pago + a pagar = soma por categoria = soma da série temporal.
- Média diária = total / quantidade inclusiva de dias do período. Arredonda
  uma única vez para centavos, com empates para longe de zero.
- Variação = (total atual − total anterior) / total anterior × 100.
  O período anterior tem a mesma quantidade de dias e termina na véspera.
  Sem base anterior positiva, a variação é `null`.
- Percentuais exibem até uma casa decimal, com a mesma regra de arredondamento
  nos dois sentidos. Exemplo: de 16 para 1 centavo resulta em −93,8%; de 16
  para 31 centavos resulta em +93,8%.
- `summary.changePercent` na API passou de número para **string decimal ou
  null** (ex.: `"75.9"`). Consumidores externos devem atualizar esse campo.
  Isso permite representar percentuais grandes sem perder casas decimais.
- Percentuais de categorias são arredondados individualmente; sua soma
  exibida pode ser 99,9% ou 100,1%. Os valores monetários continuam exatos.

## Faturamento e resultado

- Resultado = faturamento informado − todos os gastos ativos do restaurante.
  Inclui gastos pagos e a pagar; representa resultado por data do gasto,
  não fluxo de caixa nem uma apuração contábil com impostos inferidos.
- Os filtros de categoria, local, situação e busca filtram os gastos, mas
  não alteram a base de todos os gastos usada para o resultado do restaurante.
- Faturamento registrado como zero é diferente de faturamento não informado.
  Sem faturamento informado, o resultado daquele dia é `null`.
- Totais com faturamento faltante são parciais e descontam todos os gastos.
  Por isso, a soma dos resultados dos dias preenchidos pode ser diferente do
  resultado parcial total, que inclui gastos dos dias sem faturamento.
- Séries mensais e anuais respeitam os limites exatos das datas selecionadas;
  cobertura de faturamento conta somente dias dentro desses limites.

## Exportações e consistência

- Painel, planilha e PDF usam dados de uma transação somente de leitura
  `REPEATABLE READ`. O XLSX de lançamentos também reúne gastos, categorias e
  dados financeiros no mesmo snapshot, mesmo se houver edições concorrentes.
- A paginação limita as linhas visíveis, não os totais do período.
- CSV e campos de edição usam a representação decimal exata dos centavos.
- O XLSX mantém valores numéricos quando seus centavos têm até 15 algarismos.
  Acima disso, exporta texto decimal e explica a regra no resumo, preservando
  centavos que o limite numérico do Excel poderia alterar.
- Coordenadas e eixos abreviados dos gráficos são aproximações visuais;
  cartões, consultas de pontos, tabelas e relatórios usam os valores exatos.

## Evidências

`tests/financial-math.test.ts` compara 5.000 cenários determinísticos com uma
referência independente de quociente e resto em `BigInt`, além de regressões
para limites, sinais, percentuais, médias, centavos, CSV, XLSX e períodos.
`tests/expenses.test.ts` reconcilia 300 lançamentos sintéticos com PostgreSQL,
API, categorias, série temporal, filtros, faturamento e exportação XLSX,
incluindo centavos, o valor máximo permitido e o dia 29/02.

Validação desta revisão: `npm test` com 81 testes aprovados e nenhuma falha;
`npm run build`, `npm run typecheck`, `npm run lint` e `git diff --check`
concluídos sem erros.
