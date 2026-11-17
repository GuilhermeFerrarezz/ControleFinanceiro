# Revisão complementar: recuperação, confirmação e administração

Data: 17/11/2026. Escopo: fluxos atuais de autenticação e administração, testes HTTP, dependências e navegação em instância descartável. Este documento complementa os relatórios anteriores; não é certificação nem garantia de segurança absoluta ou auditoria da infraestrutura de produção.

## Correções desta revisão

| Problema | Correção | Validação |
| --- | --- | --- |
| A espera pelo Resend ocorria na resposta de recuperação/reenvio e podia revelar diferenças entre contas existentes e ausentes. | Consulta da identidade, emissão e envio agendados com `after` do Next, após finalizar a resposta genérica. Entrada e limites por e-mail continuam antes da resposta. | Resend simulado retém sua resposta; o cliente recebe 200 e o mesmo corpo da conta inexistente antes de o envio terminar. |
| Falha de reenvio substituía um token anterior ainda válido. | Configuração é validada antes de emitir. Em falha de transporte, uma transação desfaz exclusivamente a emissão atual e restaura o hash/prazo anterior, se ainda válido e não consumido. | Envio retorna 500 no provedor simulado; link anterior volta a funcionar. Se a nova emissão já foi usada com sucesso, nenhum token é ressuscitado. |
| Tokens em query strings podiam aparecer em logs HTTP. | Novos e-mails usam `#token=...`; o formulário captura o valor em memória, limpa a URL e envia o token no JSON da API. | Navegador mostra o formulário com URL limpa; HTTP testa links novos, hash no banco e ausência de consumo por GET. Links antigos continuam aceitos por compatibilidade e precisam de redação nos logs do ingresso. |
| A limpeza da URL perdia o token na repetição de efeitos do React Strict Mode. | Resolução do link preserva o valor já capturado em memória quando o efeito é repetido. Fragmentos duplicados/excessivos são rejeitados. | Problema reproduzido e corrigido no navegador em desenvolvimento, com regressão unitária específica. |
| Uma mutação administrativa autorizada antes de aguardar um lock não revalidava a sessão no commit. | Após os locks e a revalidação do administrador/senha, confere e bloqueia a sessão corrente com expiração por relógio atual. | Teste bloqueia configurações, inicia a alteração, revoga a sessão e libera o lock; a mutação recebe 401 e não altera limites. |
| Recuperação bem-sucedida podia deixar no navegador o cookie de outra conta já conectada, confundindo o retorno ao login. | Sucesso também limpa os cookies de sessão do navegador. As sessões da identidade redefinida são revogadas no banco. | Teste HTTP exige cookie expirado na resposta de sucesso; token repetido é recusado. |

Também foi adicionada validação de caracteres de controle no e-mail. Nenhuma mensagem pública informa se o endereço existe ou se um envio foi bloqueado.

## Fluxos verificados

**Esqueci minha senha:** link no login → página pública → e-mail validado e normalizado → resposta 200 genérica sem autenticar o usuário → trabalho após a resposta, sujeito a limites → conta ativa → token de 256 bits gerado por `crypto` e SHA-256 no banco → envio → link com fragmento → formulário com senha e confirmação → validação do token/finalidade/prazo → bcrypt → nova conferência e consumo em transação → alteração somente da identidade vinculada ao token → revogação de sessões → cookie removido → login explícito com nova senha. Tokens inválidos ou expirados são descartados antes de gastar bcrypt; uso concorrente permite apenas um sucesso.

**Confirmação:** cadastro ou reenvio → link de verificação válido por 24 horas → abrir o link não altera a conta → confirmação explícita por POST → consumo atômico e atualização de `email_verified_at`. Reutilização e token de recuperação usado como confirmação (ou o contrário) são recusados. A verificação não cria uma sessão nem concede administração a outras identidades.

**Administração:** autorização por UUID privado no servidor, usuário ativo e e-mail confirmado em página e API. Ausência/configuração inválida do UUID fecha o acesso. Papéis, campos de cadastro e cabeçalhos enviados pelo cliente não promovem ninguém. Mutações exigem origem aceita, senha correta, estado atual e sessão ainda válida na transação. A suspensão e exclusão continuam revogando sessões/tokens; uma recuperação não reativa uma conta bloqueada. Exclusão protege o administrador e o último dono.

Os testes existentes de isolamento financeiro, mutações, exportações e papéis continuam na suíte. O limite de privacidade do produto é o restaurante: membros de uma mesma equipe compartilham leitura financeira por design; contas de restaurantes distintos não recebem autorização por fornecer IDs externos.

## Limites de execução e entrega

`after` é usado como ciclo de vida suportado do Next, não como promessa de fila durável. Os handlers de recuperação/reenvio declaram duração máxima de 30 segundos e a chamada do Resend tem timeout de 10 segundos. Há até quatro processamentos de recuperação simultâneos por processo, 60 processamentos/minuto compartilhados no banco, mais os limites existentes de envio (dois/segundo, 30/minuto e duas operações simultâneas por processo) e por endereço/origem. Saturação descarta trabalho com resposta genérica e permite tentar novamente depois; não há fila em memória sem limite.

O cadastro continua informando seu resultado de envio sincronicamente, pois já retorna se a conta foi criada. Recuperação e reenvio não afirmam entrega. Se o processo encerrar ou a plataforma não sustentar `after`, o trabalho pode não concluir; a hospedagem precisa suportar o mecanismo ou fornecer uma fila durável com desenho compatível com a política de segredos. Uma indisponibilidade do banco também pode impedir a compensação de falha. Respostas ambíguas do provedor podem significar que uma mensagem chegou contendo um link já compensado; o usuário deve solicitar outro link. Não existe transação atômica entre PostgreSQL e entrega de e-mail.

## Evidências locais

- Suíte automatizada completa: 159 testes aprovados, sem falhas; build, lint e tipos aprovados, com schemas PostgreSQL isolados e transporte Resend simulado. Logs em `reports/auth-security-hardening-tests.log`; auditoria de dependências em `reports/security-auth-dependencies.json`.
- Auditoria npm nesta revisão: zero vulnerabilidades conhecidas. Isso não demonstra ausência de vulnerabilidades inéditas.
- Navegador em desenvolvimento: clique real em “Esqueci minha senha”, envio com e-mail fictício, resposta genérica, abertura do link de recuperação e campos corretos, remoção do token da URL, solicitação/abertura/confirmação de e-mail e rejeição do mesmo link reutilizado. A troca efetiva de senha foi exercitada nos testes HTTP. A instância e seu schema descartáveis foram encerrados e removidos.
- Evidência visual da confirmação: `reports/auth-confirmation-browser.jpg`, sem dados reais nem token na URL.

## Pendências de produção e limites da conclusão

1. No ambiente local, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_ORIGIN` e `TRUSTED_CLIENT_IP_HEADER` estão ausentes; `PLATFORM_ADMIN_USER_ID` está configurada. Entrega real de e-mail, DNS do remetente e os limites por IP não foram comprovados. Configure o Resend e origem HTTPS explícita, reinicie a aplicação e teste com uma caixa real antes de publicar.
2. Desative rastreamento de cliques/aberturas no domínio usado para mensagens de autenticação. Serviços que reescrevem links podem registrar o destino completo, inclusive segredos; o fragmento protege as requisições para a aplicação, não todo o caminho externo do e-mail. No Resend, esse controle é do domínio, não de um parâmetro inventado por mensagem.
3. Configure um ingresso confiável que sobrescreva o cabeçalho de IP, bloqueie acesso direto e limite tráfego. Não habilite confiança em `X-Forwarded-For` arbitrário. Redija `token`, `senha`, `Cookie` e `Authorization` de logs, inclusive links legados com query string.
4. A aplicação não implementa MFA; a política existente aceita senhas de seis caracteres. Para o administrador, use senha longa e exclusiva, MFA na caixa de e-mail e proteja o servidor e o banco. MFA/passkeys na própria aplicação e uma política mais forte são recomendações adicionais, não funcionalidades alegadas por esta revisão. Credenciais/sessões roubadas continuam sendo um risco.
5. A revisão não comprova TLS/certificados da conexão PostgreSQL, criptografia em disco/backups, isolamento de rede, menor privilégio do usuário do banco, retenção de dados/logs ou restauração de backups. Integridade e confidencialidade em produção dependem também desses controles.
6. Revogação controla requisições futuras e mutações revalidadas; não remove dados que alguém autorizado já copiou. Não há garantia contra todos os ataques, extensões maliciosas no navegador, comprometimento do dispositivo ou exploração de falhas desconhecidas.

## Referências

- [OWASP — Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): resposta genérica, tokens aleatórios de uso único, prazo e proteção contra abuso.
- [OWASP — Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): negar por padrão e conferir permissões no servidor em cada requisição.
- [Next — after](https://nextjs.org/docs/app/api-reference/functions/after): execução após a resposta e dependência da duração/suporte da plataforma.
- [Resend — Sending overview](https://github.com/resend/resend-skills/blob/main/skills/resend/references/sending/overview.md): rastreamento configurado por domínio; recomendado desativá-lo para e-mails sensíveis.
