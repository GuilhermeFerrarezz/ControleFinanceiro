# Conta de demonstração

O comando de operador `npm run demo:create` cria `demo@saldodacasa.app`, uma senha aleatória forte e um restaurante chamado **Restaurante Demonstração — DADOS FICTÍCIOS**. A conta fica ativa sem vencimento automático até o administrador suspender ou excluir. Ela é dona somente desse restaurante e não administra a plataforma.

Os exemplos cobrem o mês atual até hoje e os dois anteriores, incluindo gastos detalhados, faturamento, refeições, pedidos, produtos e estoque. O comando reaproveita o gerador de exemplos existente. A conta fictícia é provisionada pelo operador como verificada; não é enviado e-mail de confirmação ou recuperação. Não compartilhe a conta administradora real para demonstrar o sistema.

## Criar no site publicado

1. No `.env` **local**, adicione `DEMO_DATABASE_URL` com a conexão do **mesmo banco Neon utilizado pela Production na Vercel**. Não altere `DATABASE_URL` local e não envie a conexão ao chat/Git.
2. Confira no painel de admin se há capacidade para **mais um restaurante e um usuário**. O comando respeita os limites existentes; não os aumenta.
3. Rode `npm run demo:create`. A criação da conta, do restaurante e dos exemplos ocorre em uma única transação. Se algo falhar, tudo é revertido.
4. A saída mostra os IDs e o caminho `.backups/demo-access-....json`. Abra esse arquivo local ignorado pelo Git para consultar e-mail e senha. A senha não aparece no log.
5. Entre em `https://saldodacasa.app/login` com essas credenciais e confira as telas. Os exemplos incluem o mês atual para que os gráficos iniciais já tenham registros.
6. Remova `DEMO_DATABASE_URL` do `.env` depois da operação e guarde as credenciais em local seguro.

O comando não migra o banco nem modifica restaurantes existentes e não pode ser usado para atualizar uma conta já cadastrada. Uma repetição com o mesmo e-mail é recusada. Se a conta já existir, gerencie-a no painel ou use a recuperação de senha por um endereço que realmente receba e-mails; o comando não redefine senhas existentes.

Não é necessário publicar uma API de geração de exemplos nem cadastrar credenciais adicionais na Vercel: o comando escreve diretamente no banco selecionado. Ainda assim, use a versão do código correspondente ao schema aplicado nesse banco.

## Remover depois

No painel de administrador da plataforma, desative e exclua primeiro o **restaurante de demonstração**, conferindo o nome exato. Depois exclua a conta `demo@saldodacasa.app`. Essa ordem respeita a proteção contra excluir uma conta que é a única dona de um restaurante. Os dados reais de outros restaurantes são preservados.

A conta permite editar dados e gerenciar a equipe do próprio restaurante fictício. Compartilhe a senha apenas com quem participará da demonstração. Ela não é uma conta pública ou somente leitura.
