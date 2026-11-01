# Revisão de 01/11/2026

Revisão de código das rotas de autenticação, sessões, restaurantes, equipe, convites, gastos, exemplos, painel, importação e exportação. Os testes de integração executam em schemas PostgreSQL temporários; não usam as tabelas da aplicação.

## Correções

- Criação, edição e exclusão de gastos revalidam o vínculo dentro da transação. O bloqueio compartilhado impede que uma revogação ou alteração do papel ultrapasse a autorização. A edição consulta o papel atual no banco.
- CSV exportado usa escape reversível para textos que começam com fórmulas ou apóstrofos. A reimportação reconhece o cabeçalho completo do sistema e desfaz esse escape antes de validar o tamanho do campo.
- IDs externos definem a identidade de importação, evitando duplicação após mudança de conteúdo. A prévia reconhece repetições do mesmo ID dentro do arquivo e mantém compatibilidade com as chaves antigas baseadas no conteúdo.
- CSV do Excel com BOM UTF-16 LE/BE passa a ser decodificado, além de UTF-8 e Windows-1252.
- Caracteres nulos em textos de gastos e nomes são rejeitados antes de chegar ao PostgreSQL.
- O gráfico identifica o ponto selecionado pela data e deixa de acessar índices inexistentes após mudança de período.
- O formatador monetário é reutilizado, evitando sua recriação para cada valor renderizado.

## Validação

Compilação de produção, ESLint, TypeScript e testes automatizados. Cobertura inclui autenticação, CSRF, isolamento entre restaurantes, permissões, SQL como texto, concorrência, revogação de acesso durante gravação, rollback integral da importação, duplicidade, limites de arquivo/linhas, UTF-16, fórmulas como texto, XLSX e PDF. A interação visual em navegador e a abertura em aplicativos reais Excel/LibreOffice não foram verificadas nesta revisão.

## Dependências: pendência conhecida

`npm audit` apontou 23 alertas moderados, nenhum alto ou crítico, ligados à cadeia transitiva de `minimatch`. O aviso [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) informa correção em 11.0.1 e consumo excessivo de CPU/memória com padrões glob controlados por atacante. O código revisado não encaminha padrões glob de usuários para essas dependências; isso reduz a exposição identificada, mas não elimina os alertas.

Não foi aplicado `npm audit fix --force`: as sugestões incluem regressões de versões principais do ESLint/Next e ExcelJS. Uma migração da cadeia de dependências exige validação de compatibilidade; substituir globalmente versões antigas de minimatch pela 11 pode quebrar consumidores de sua API antiga.

## Limites e comportamento

- Importação aceita CSV, até 2 MB e 2.000 registros. XLSX é formato de exportação; para importar um XLSX, salve-o como CSV no editor de planilhas.
- Exportação CSV/XLSX permite até 10.000 gastos; arquivos acima dos limites de importação precisam ser divididos antes de reimportar.
- Sem ID externo, a deduplicação continua baseada em conteúdo e ocorrência: um gasto idêntico de outro arquivo pode ser considerado repetido. Para distinguir gastos idênticos independentes, utilize IDs diferentes ou o cadastro manual.
- Registros com ID já identificado são ignorados, não atualizados. Chaves antigas não permitem recuperar o ID externo original de importações anteriores à correção; se o conteúdo de um arquivo antigo for alterado antes da primeira reimportação nesta versão, confira a prévia.

A revisão e os testes reduzem riscos conhecidos; não constituem garantia de ausência de todos os bugs ou um teste de invasão completo.
