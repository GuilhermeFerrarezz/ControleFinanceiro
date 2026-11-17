# Administração da plataforma

O painel `/admin` controla restaurantes e usuários, com ativação/suspensão e limites globais. Não há integração de cobrança: o administrador decide manualmente quando suspender ou reativar.

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

## Segurança e operação

- Página e APIs verificam sessão, UUID configurado, conta ativa e e-mail confirmado no servidor. Contas comuns não carregam o painel ou as listas administrativas.
- O cadastro público ignora permissões enviadas pelo cliente. Não há endpoint para promover uma conta.
- Toda mudança exige novamente a senha do administrador, valida a origem da requisição e usa a capacidade compartilhada de bcrypt. Leituras e tentativas administrativas têm limites por identidade.
- A mutação revalida a identidade e o hash da senha sob bloqueio, valida as entradas e compara o estado anterior para recusar alterações de uma tela desatualizada.
- Alterações geram `platform_audit` na mesma transação, com autor, alvo, antes/depois e horário. Não existe endpoint para excluir esse histórico.
- As listagens são paginadas (30 registros), pesquisáveis e não incluem senhas, hashes ou tokens. Respostas administrativas usam `Cache-Control: no-store`.
- Os testes usam PostgreSQL isolado e cobrem privilégio, origem, senha, suspensão/reativação, tokens, sessões e capacidade sob concorrência.
