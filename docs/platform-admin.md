# Administração da plataforma

O painel `/admin` controla restaurantes e usuários, com ativação/suspensão e limites globais. Não há integração de cobrança: o administrador decide manualmente quando suspender ou reativar.

## Integrantes dos restaurantes

Na aba **Restaurantes**, clique em **Ver integrantes** para consultar nome, e-mail, função (dono ou funcionário), situação da conta e confirmação de e-mail. A consulta mostra 30 pessoas por página, inclui contas suspensas e permite consultar restaurantes suspensos. Contas excluídas e convites ainda não aceitos não são integrantes. O botão **Ocultar integrantes** recolhe a lista.

Somente o administrador da plataforma pode acessar essa consulta, inclusive pela API. Ela não retorna senhas, tokens ou dados financeiros. Conta ativa e e-mail confirmado não garantem acesso se o restaurante estiver suspenso.

## Excluir um restaurante

Na aba **Restaurantes**, desative o restaurante e clique em **Excluir restaurante**. A exclusão só é permitida para restaurantes desativados e exige digitar o nome exato e confirmar a senha da conta administradora. O servidor revalida administrador, sessão, senha, nome e situação atual dentro da transação. Uma listagem desatualizada deve ser recarregada antes de confirmar.

Essa ação é irreversível: remove gastos, auditoria financeira, faturamento, cadastros, estoque, movimentações, convites e vínculos daquele restaurante. As sessões que ainda apontarem para ele são revogadas. As contas dos usuários, outros restaurantes e suas sessões/dados são preservados. A exclusão libera a vaga de restaurante, sem alterar o total de usuários. O histórico administrativo registra responsável, restaurante e situação anterior, e permanece após a exclusão.

Para inadimplência, use **Desativar**, que preserva todos os dados e permite reativação. A exclusão serve para remover testes ou encerrar definitivamente um cadastro. Não existe exclusão automática por falta de pagamento.

## Primeiro acesso

1. Aplique `npm run db:migrate` e crie sua conta pessoal pelo cadastro do site, se ainda não tiver conta.
2. Confirme seu e-mail. Em desenvolvimento sem Resend, abra o link impresso no terminal. Você também pode solicitar um novo link em `/verify-email`.
3. No terminal da máquina que hospeda o sistema, execute:

   ```sh
   npm run admin:configure -- seu@email.com
   ```

4. Reinicie o servidor, entre com essa conta e abra `/admin`. Há também um link “Administrar plataforma” no menu da sua conta.

O comando identifica uma conta existente e ativa e grava somente seu UUID em `PLATFORM_ADMIN_USER_ID` no `.env`. Não cria senha padrão nem promove o primeiro cadastro. A permissão é exclusiva para esse UUID e exige e-mail confirmado; o papel `admin` antigo significa dono de restaurante e não concede administração da plataforma. Sem UUID configurado, nenhum usuário acessa o painel. Em hospedagem gerenciada, configure o mesmo UUID como variável de ambiente privada e reinicie o serviço; a variável do provedor pode prevalecer sobre o `.env`.

O provisionamento deve ser feito por quem administra o servidor. Não compartilhe acesso ao terminal, `.env`, banco ou conta administrativa. Para trocar a conta administradora, execute o comando com o novo e-mail e reinicie o servidor. Não há alteração dessa permissão pelo site.

## Limites e contagem

- Valores iniciais: 10 restaurantes e 100 usuários.
- A contagem inclui todos os cadastros, inclusive suspensos e a conta administradora. A mesma pessoa em vários restaurantes conta uma vez como usuário.
- Contas excluídas liberam a vaga de usuário, mesmo quando uma identidade sem os dados originais precisa permanecer apenas para preservar referências históricas.
- O cadastro normal também cria um restaurante; por isso, a conta usada na configuração inicial pode ocupar uma vaga de restaurante.
- Os limites são independentes. Convidar uma pessoa existente não consome vaga de usuário; criar uma pessoa por convite consome vaga.
- Reduzir o limite abaixo do total atual não apaga ou suspende registros. Novas criações ficam bloqueadas. Zero bloqueia novas criações dessa categoria.
- As verificações ficam nos repositórios de criação, com bloqueio da linha única de configurações durante a transação. Cadastros simultâneos não ultrapassam a capacidade, e falta de vaga de usuário reverte também a criação do restaurante.
- As cotas valem para operações da aplicação. O operador do banco, que é uma autoridade confiável, pode executar SQL direto; não há trigger proibindo operações administrativas no banco.

## Suspensões

**Restaurante:** marca o restaurante como inativo e remove as sessões que usam aquele contexto. Dono e funcionários perdem o acesso; convites ficam indisponíveis enquanto suspenso. Outros restaurantes ativos da mesma pessoa continuam acessíveis ao entrar novamente. A reativação preserva vínculos, lançamentos, estoque e histórico, mas não recria sessões removidas.

**Usuário:** marca a identidade como inativa, remove todas as suas sessões e tokens de autenticação e impede login e uso da recuperação de senha para contornar o bloqueio. A reativação exige novo login. A suspensão de um dono não suspende automaticamente o restaurante nem outros membros; para inadimplência, suspenda o restaurante.

Suspender não apaga dados. Operações que já terminaram antes do bloqueio permanecem válidas; mutações que revalidam o vínculo adquirem bloqueios compartilhados dos registros ativos, coordenando-se com as suspensões. A consulta de sessão valida o estado ativo no servidor em cada requisição.

A conta administradora não pode ser desativada no painel. Ela pode acessar `/admin` mesmo que esteja vinculada apenas a restaurantes suspensos, evitando perda do controle da plataforma.

## Exclusão de contas

Na aba **Usuários**, use **Excluir conta**. A confirmação identifica o e-mail selecionado, explica a preservação do histórico e exige digitar `EXCLUIR` e informar novamente a senha do administrador. A exclusão é definitiva; para um bloqueio temporário, use a desativação.

- A conta administradora configurada no servidor não pode ser excluída. Também não pode ser excluída uma pessoa que seja a única dona de algum restaurante (inclusive suspenso), ou cujos outros donos estejam todos suspensos. É preciso manter a conta suspensa ou transferir a responsabilidade para outro dono ativo antes; esse fluxo não faz transferência automática.
- Sem referências históricas, o registro da pessoa é removido. Vínculos, sessões e tokens são removidos. Os restaurantes não são apagados.
- Com autoria em gastos, auditoria, estoque ou convites, mantém-se o ID para preservar as referências. O nome passa a `Usuário excluído`, o e-mail é substituído por um endereço aleatório não entregável, a senha é substituída por um hash de segredo aleatório descartado, e os vínculos, verificação e sessões são removidos. O registro recebe `deleted_at`, fica inativo e não pode ser reativado pelo painel. Uma restrição no banco também impede reativar essa identidade excluída.
- Convites destinados ao e-mail removido são revogados e têm o destinatário substituído. Convites pendentes criados pela pessoa também são revogados. Assim, uma nova conta com o e-mail antigo não herda os links ou os acessos anteriores.
- A identidade excluída sai das listagens e da contagem de vagas. Uma nova inscrição com o mesmo e-mail cria um novo ID, sujeito às cotas, sem receber o histórico ou os vínculos da conta excluída.
- Gastos, movimentos e auditorias financeiras não são alterados. Textos livres, anexos externos, backups e logs que já contenham dados pessoais não são reescritos por este fluxo; a remoção do nome/e-mail cadastral não deve ser interpretada como varredura de todas as cópias ou eliminação de todo dado pessoal.
- A operação é transacional e registra `user_deleted` na auditoria administrativa sem copiar o nome ou e-mail original. O bloqueio de configurações serializa exclusões concorrentes de co-donos, evitando deixar um restaurante sem responsável.

## Segurança e operação

- Página e APIs verificam sessão, UUID configurado, conta ativa e e-mail confirmado no servidor. Contas comuns não carregam o painel ou as listas administrativas.
- O cadastro público ignora permissões enviadas pelo cliente. Não há endpoint para promover uma conta.
- Toda mudança exige novamente a senha do administrador, valida a origem da requisição e usa a capacidade compartilhada de bcrypt. Leituras e tentativas administrativas têm limites por identidade.
- A mutação revalida a identidade e o hash da senha sob bloqueio, valida as entradas e compara o estado anterior para recusar alterações de uma tela desatualizada.
- Alterações geram `platform_audit` na mesma transação, com autor, alvo, antes/depois e horário. Não existe endpoint para excluir esse histórico.
- As listagens são paginadas (30 registros), pesquisáveis e não incluem senhas, hashes ou tokens. Respostas administrativas usam `Cache-Control: no-store`.
- Os testes usam PostgreSQL isolado e cobrem privilégio, origem, senha, suspensão/reativação, tokens, sessões e capacidade sob concorrência.
