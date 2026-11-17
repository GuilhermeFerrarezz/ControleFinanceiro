# Revisão de segurança — 17/11/2026

## Conclusão e escopo

Não foi encontrado acesso anônimo aos dados financeiros nem acesso entre restaurantes distintos nos caminhos revisados e testes executados. Isso não constitui garantia absoluta de segurança: a revisão cobre código, dependências instaladas e testes locais com PostgreSQL isolado, sem avaliação da infraestrutura de produção.

Foram revisados os handlers de API, páginas protegidas, sessão, papéis, convites, repositórios SQL, importações/exportações, estoque, faturamento e recuperação de senha. A matriz automatizada percorre 15 caminhos de negócio e 27 combinações de caminho/método, com 54 tentativas sem sessão ou com cookie e identidade forjados. Também verifica redirecionamento das 11 páginas protegidas. As APIs validam a sessão independentemente do proxy.

O limite de privacidade do produto é o restaurante: membros do mesmo restaurante consultam os dados financeiros compartilhados; funcionários alteram os próprios gastos, donos administram o restaurante. Não há isolamento de leitura por autor dentro da mesma equipe. Donos podem consultar nomes/e-mails de sua equipe; funcionários não recebem a lista de equipe e convites no painel.

## Problemas corrigidos

| Prioridade | Problema | Correção e evidência |
| --- | --- | --- |
| Alta | Login podia comparar a senha antiga, aguardar uma redefinição e criar uma sessão depois da revogação das sessões. | Criação de sessão bloqueia a identidade com `FOR UPDATE` e confere se o hash comparado continua atual antes do INSERT. Redefinição usa o mesmo bloqueio. Teste HTTP força o intercalamento por transação e exige 401, sem sessão residual. |
| Média | Tokens de recuperação com formato válido, mas inexistentes/expirados, provocavam bcrypt antes da consulta ao token. | Consulta barata verifica hash, finalidade e expiração antes de bcrypt. Consumo transacional continua revalidando expiração e uso único, evitando corrida. Teste unitário garante zero chamadas a bcrypt para token inexistente/expirado. |
| Média | Confirmação de senha na exclusão do restaurante não usava a capacidade compartilhada de bcrypt. | Aplicado `withPasswordBudget`, mantendo limite por usuário e resposta 429 em saturação. |
| Média | Dependência `next@16.4.3` afetada por GHSA-mfr8-8qww-v76h. | Atualizados Next.js e eslint-config-next para 16.4.6, com lockfile. Auditoria npm posterior retornou zero vulnerabilidades conhecidas. |

O [aviso oficial do Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h) descreve vazamento de cache entre root params em chamadas combinadas de `use cache` e `unstable_cache`; a correção existe desde 16.4.5. Não foram encontradas essas chamadas no aplicativo. A dependência foi atualizada mesmo assim.

## Autorização e proteção dos dados

- Sessões opacas aleatórias, com apenas SHA-256 no banco, prazo fixo e cookie HttpOnly/SameSite=Lax; Secure em produção. Cabeçalhos de identidade e tokens enviados por Authorization não concedem acesso.
- Identidade, vínculo e restaurante ativo vêm do banco. Alterar `empresaId`, `userId`, IDs de gastos, produtos, convites ou membros não concede autorização. Os testes existentes verificam leituras, alterações, remoções e exportações entre restaurantes e papéis distintos.
- Consultas de gastos, catálogo, estoque e faturamento restringem o restaurante com parâmetros SQL. Interpolações SQL revisadas são trechos internos/controlados; não foi identificado SQL arbitrário derivado de entrada do usuário.
- Mutações relevantes revalidam vínculos na transação e usam bloqueios. Remoção de membro revoga sessões do contexto; expiração e restaurante inativo invalidam acesso. Formulários vinculam o restaurante exibido para evitar mutações no contexto trocado em outra aba.
- Respostas privadas da API usam `Cache-Control: no-store`; componentes financeiros carregam a sessão no servidor. Não foi encontrado cache compartilhado deliberado de dados privados, `dangerouslySetInnerHTML` ou credenciais `NEXT_PUBLIC` no código revisado.
- Importações têm limites de tamanho/registros e transações; exportações de planilhas neutralizam fórmulas. Erros públicos evitam detalhes SQL e conexão. Arquivos do banco/backups não estão em `public` nem a aplicação oferece endpoint para baixá-los.

## Recuperação de senha

- `crypto.randomBytes(32)`, SHA-256 persistido, finalidade `password_reset`, validade de 30 minutos; verificação de e-mail tem finalidade distinta e validade de 24 horas.
- Solicitação retorna mensagem e status 200 genéricos para e-mail ausente, limitação e falha do provedor; origem proibida recebe 403. As respostas não devolvem tokens.
- Limites por endereço/finalidade: 60 segundos e três solicitações em 15 minutos. Limites globais de envio: dois por segundo, 30 por minuto, até duas operações simultâneas por processo. Limites por IP dependem do ingresso confiável configurado.
- O token é validado novamente e deletado junto da alteração da senha em uma transação. Uso concorrente resulta em um sucesso e uma recusa. Todos os tokens de sessão da identidade são revogados na redefinição.
- O usuário alterado é obtido exclusivamente do token. Campos `userId` e `email` fornecidos na redefinição não escolhem a conta; teste verifica que a senha de outra identidade permanece intacta.
- Senha nova passa pelas validações de cadastro, inclusive limite de 72 bytes do bcrypt. Frontend exige confirmação da senha. Login com a senha antiga falha após a troca, inclusive no intercalamento concorrente corrigido.
- Links de produção exigem `APP_ORIGIN` HTTPS; cabeçalhos Host não escolhem o destino. Tokens e respostas do Resend não são registrados em produção. O fallback com link no terminal existe exclusivamente em desenvolvimento sem chave.

## Pendências e limites da conclusão

1. O ambiente local não possui `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_ORIGIN` ou `TRUSTED_CLIENT_IP_HEADER`. O cliente HTTP do Resend foi testado com fetch simulado; entrega real e configuração do domínio não foram comprovadas. Reiniciar o servidor após configurar o `.env`.
2. Antes de publicar, configurar origem HTTPS e um ingresso que sobrescreva o cabeçalho confiável de IP e bloqueie acesso direto. Sem esse ingresso os limites por e-mail/global e capacidade continuam ativos, mas os limites por IP não estão ativos. Proteção contra tráfego distribuído exige também limites no proxy/WAF.
3. A revisão não comprova criptografia em disco/backups, TLS da conexão PostgreSQL, permissões do usuário do banco, isolamento de rede, retenção dos logs ou segurança de contas administrativas do provedor. As senhas têm hash; os demais dados financeiros não recebem criptografia de campo na aplicação.
4. A política atual permite senha com seis caracteres e login antes da confirmação do e-mail. Mantida para compatibilidade; confirmar endereço não é hoje uma condição de autorização. Recomenda-se definir uma política mais forte e uma migração explícita caso se deseje exigir e-mail verificado.
5. Cadastro continua informando e-mail já existente com 409. Recuperação/reenvio não revelam isso no corpo/status, mas envio síncrono pode produzir diferenças de tempo entre contas existentes e ausentes. Resistência a enumeração por tempo exige fila assíncrona e revisão própria; não é garantida por esta implementação.
6. Um convite válido é uma credencial por posse e mostra o restaurante/e-mail convidado a quem tem o link. Deve ser compartilhado apenas com o destinatário. Não foi encontrado modo de enumerar ou adivinhar os tokens aleatórios.

## Evidências

`npm run build`, `npm run typecheck`, `npm run lint`, suíte de testes e regressões HTTP de acesso/recuperação. Testes de integração criam e removem schemas temporários; não acessam dados financeiros reais. Saídas locais em `reports/security-review-tests.log` e `reports/security-audit-dependencies-after.json`, ignoradas pelo Git. A ausência de avisos no npm audit significa ausência de vulnerabilidades conhecidas naquela consulta, não ausência de qualquer falha.
