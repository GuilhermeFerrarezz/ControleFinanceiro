# Backup diário do Neon

O workflow `.github/workflows/backup-neon.yml` exporta um snapshot consistente do banco inteiro com `pg_dump`, criptografa o fluxo com age e armazena somente `database.dump.age` como artifact no GitHub Actions. Ele não modifica o banco e não depende da Vercel estar ativa.

- Agendamento diário: 06:17 UTC, equivalente a 03:17 de Brasília (UTC-3).
- Retenção: sete dias, inclusive para execuções manuais.
- Execução: somente `main`, manualmente ou por agendamento. Não há gatilho por push ou pull request e não é necessário checkout do código.
- Chave privada: não é enviada ao GitHub. Apenas a chave pública é usada para criptografar.
- Limite por arquivo criptografado: 40 MiB. Acima disso o job falha e não publica um backup incompleto. Sete arquivos diários nesse limite ocupam até 280 MiB; execuções manuais e outros artifacts também consomem a franquia compartilhada.
- Snapshot inclui usuários, hashes de senha, sessões, tokens armazenados como hash, dados financeiros e auditorias. Nunca publique o dump descriptografado.

O objetivo é uma cópia diária. Agendamentos do GitHub podem atrasar ou deixar de executar: não há garantia de perda máxima exata de 24 horas. Configure notificações de falha, confira a última execução e teste restaurações. Em repositórios públicos, o GitHub pode desativar agendamentos após 60 dias sem atividade.

## 1. Gere sua chave fora do repositório

Baixe o arquivo Windows amd64 em [age Releases](https://github.com/FiloSottile/age/releases) e extraia para uma pasta segura fora do projeto. Abra o PowerShell nessa pasta. Com `age-keygen.exe` no diretório atual:

```powershell
.\age-keygen.exe -o backup-neon-key.txt
.\age-keygen.exe -y backup-neon-key.txt
```

O segundo comando mostra a chave pública `age1...`. Guarde o arquivo `backup-neon-key.txt` (contém `AGE-SECRET-KEY-...`) em dois locais seguros, por exemplo um gerenciador de senhas e uma cópia offline. Sem essa chave privada você não consegue restaurar. Não envie esse arquivo ao chat, GitHub, Vercel ou Neon. Não substitua a chave sem preservar a antiga enquanto houver backups criptografados com ela.

## 2. Cadastre a conexão e a chave pública no GitHub

No **Neon de produção → Connect**, desative **Connection pooling** e copie a conexão direta do banco que deseja proteger. Use `sslmode=verify-full` na URL para validar certificado e hostname. A rotina rejeita hostnames com `-pooler`.

No repositório GitHub → **Settings → Secrets and variables → Actions**:

| Aba | Nome | Valor |
| --- | --- | --- |
| Secrets | `BACKUP_DATABASE_URL` | URL direta completa do Neon de produção, com senha |
| Variables | `BACKUP_AGE_RECIPIENT` | Somente a chave pública `age1...` |
| Variables | `BACKUP_POSTGRES_IMAGE` | Imagem do cliente PostgreSQL, conforme abaixo |

Não cadastre a chave privada. Essas configurações são do GitHub, não da Vercel nem do `.env` local. Não coloque aspas extras nos valores.

Para conferir a versão principal do banco, execute no SQL Editor do Neon:

```sql
SHOW server_version;
```

Exemplos: servidor 17 → `postgres:17-bookworm`; servidor 18 → `postgres:18-bookworm`. Use uma imagem oficial disponível com a mesma versão principal (ou mais recente), baseada em Debian, pois o job instala age por `apt-get`. O padrão sem variável é `postgres:18-bookworm`; se o servidor for mais recente, o job recusa executar até ajustar. Atualize o cliente quando atualizar a versão principal do servidor.

A conta da conexão precisa poder ler todas as tabelas exportadas. Para uma conta exclusiva de backup, configure permissões de leitura e privilégios padrão para tabelas futuras com o responsável pelo banco. Não use uma conta que só enxerga parte dos dados ou é limitada por RLS sem conferir a abrangência do dump. Rotacione o secret se a senha mudar.

## 3. Publique a configuração e execute o primeiro backup

Faça o merge da branch do backup na `main` e envie ao GitHub. O workflow precisa existir na branch padrão (`main`) para aparecer com execução manual/agendada. Esta implementação não faz merge, push ou cadastra credenciais automaticamente.

1. Abra **Actions → Backup Neon → Run workflow**.
2. Selecione `main` e execute.
3. Confira todos os passos e o status de sucesso, incluindo upload.
4. Abra a execução e baixe o artifact `neon-backup-...`. Extraia `database.dump.age` do ZIP.
5. Confira se o agendamento produziu outro backup no dia seguinte. A primeira execução manual não garante que o agendamento funcionará.

Se o workflow estiver desativado, habilite GitHub Actions para o repositório. Não relaxe as permissões do token para escrita: o upload usa o serviço de artifacts e o workflow precisa apenas de `contents: read`.

## 4. Teste a restauração em outro banco vazio

Crie um banco ou projeto Neon temporário vazio, separado da produção. Não aplique `schema.sql` nele antes: o dump já inclui a estrutura. Use ferramentas `pg_restore` da mesma versão principal usada para criar o dump e PostgreSQL de destino compatível, de preferência da mesma versão do servidor de origem.

Na pasta segura com sua chave privada, descriptografe com age:

```powershell
.\age.exe -d -i backup-neon-key.txt -o database.dump database.dump.age
```

O arquivo `database.dump` contém os dados em texto recuperável: mantenha-o fora do Git, compartilhamentos e pastas públicas.

Para não gravar a URL com senha no histórico do terminal, configure a conexão do **banco temporário de restauração** por uma leitura interativa:

```powershell
$restoreSecret = Read-Host 'Cole a URL DIRETA do banco TEMPORARIO vazio' -AsSecureString
$env:PGDATABASE = [System.Net.NetworkCredential]::new('', $restoreSecret).Password
try {
    pg_restore --no-password --no-owner --no-acl --exit-on-error --single-transaction --dbname=$env:PGDATABASE database.dump
    if ($LASTEXITCODE -ne 0) { throw 'A restauração falhou. Confira o banco temporário e a compatibilidade da versão.' }
} finally {
    Remove-Item Env:PGDATABASE
    $restoreSecret.Dispose()
}
```

`pg_restore` deve estar instalado e acessível no PATH. Não adicione `--clean`: o teste deve usar banco vazio. A string ainda pode aparecer temporariamente na lista local de processos; faça isso apenas em uma máquina confiável.

No SQL Editor do banco restaurado, confira:

```sql
SELECT
  (SELECT count(*) FROM usuarios) AS usuarios,
  (SELECT count(*) FROM empresas) AS restaurantes,
  (SELECT count(*) FROM expenses) AS gastos,
  (SELECT count(*) FROM expense_audit) AS auditorias,
  (SELECT count(*) FROM daily_revenue) AS faturamentos;
```

Compare com os totais conhecidos no momento da cópia e confira valores financeiros e vínculos de integrantes. Se testar a aplicação restaurada, use ambiente isolado, sem enviar e-mails aos clientes e sem compartilhar o domínio de produção. Somente após a restauração funcionar considere a rotina validada. Repita periodicamente e após mudanças importantes no schema.

## Operação e custo

- Ative notificações de falha do GitHub Actions na sua conta e verifique a data do último backup bem-sucedido. O workflow não envia e-mails pelo Resend.
- Observe o consumo em **GitHub Settings → Billing / Usage**. A gratuidade depende da franquia da conta, outros workflows e tamanho dos artifacts; configure o orçamento para bloquear uso pago se não desejar cobranças.
- Monitore também a franquia de tráfego e compute do Neon: exportar o banco lê e transfere dados.
- Baixe periodicamente uma cópia criptografada para outro local seguro, pois artifacts expiram após sete dias. Múltiplas execuções manuais podem consumir armazenamento extra.
- Não reduza a retenção nem apague a última cópia boa antes de validar a nova. Não coloque backups nem chaves privadas em commits.
- Restaurar o banco não restaura as variáveis da Vercel/GitHub, domínio ou configuração Resend. Guarde esses dados separadamente em um gerenciador de senhas. O UUID administrativo precisa corresponder à conta restaurada.

## Fontes

- [Neon: pg_dump e conexão direta](https://neon.com/docs/manage/backup-pg-dump)
- [GitHub: agendamentos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub: limites](https://docs.github.com/en/actions/reference/limits)
- [Upload de artifacts](https://github.com/actions/upload-artifact)
- [age](https://github.com/FiloSottile/age)
