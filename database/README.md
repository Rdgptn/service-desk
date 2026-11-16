# PostgreSQL e contas locais

O Help Desk usa PostgreSQL como fonte persistente para contas, papéis, chamados, comentários, histórico, categorias, SLA e sessões HTTP.

## Tabelas e IDs

- `users`: `id BIGSERIAL PRIMARY KEY` é gerado pelo PostgreSQL no cadastro, não pode ser enviado pelo navegador e não muda enquanto o usuário existir. E-mail normalizado tem unicidade sem diferenciar maiúsculas/minúsculas; nome, setor, hash da senha e papel ficam associados a esse ID.
- `tickets`: contém referência ao `users.id`, nome/setor informados no chamado, assunto, descrição, categoria, prioridade, estado, atribuição, SLA e datas.
- `ticket_comments` e `ticket_history`: conversa e trilha de auditoria ligadas ao chamado e à conta que realizou a ação.
- `admin_invites`: autorização criada somente por admin. Se o usuário ainda não existe, o cadastro com esse mesmo e-mail recebe papel admin; se já existe, a promoção é imediata.
- `categories` e `app_settings`: categorias, equipes e prazos que admins mantêm na interface.
- `ponto_sessions`: sessões Express com expiração, gerenciadas por `connect-pg-simple`.

A senha nunca é gravada em texto puro: `server/passwords.js` aplica scrypt com salt exclusivo. `.env` contém segredos de inicialização e deve permanecer local; use o `.env.example` apenas como modelo.

## Bootstrap, sessão e autorização

No primeiro início, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_NAME` e `INITIAL_ADMIN_PASSWORD` criam um usuário admin com ID interno. Depois que esse registro e o hash forem gravados, pode-se remover `INITIAL_ADMIN_PASSWORD` do `.env`. Novos cadastros entram como solicitantes. `ALLOWED_EMAIL_DOMAINS` limita os endereços aceitos, mas não verifica a posse da caixa postal; confirme a identidade antes de promover um usuário a admin.

O navegador não escolhe papel. O servidor recarrega o usuário da sessão e aplica `requireAdmin` em cada endpoint administrativo. Solicitantes podem consultar categorias para preencher o formulário e enviar chamados associados ao próprio ID; não há endpoint de leitura da fila disponível para eles.

## Migrações

`server/schema.sql` roda de forma idempotente ao iniciar e acrescenta `department`, `password_hash` e índice normalizado de e-mail. As antigas colunas `tenant_id` e `entra_oid` são mantidas como opcionais para que a mudança do esquema não remova dados anteriores; novas contas locais não usam esses campos. Chamados, comentários e histórico existentes não são apagados.

As categorias, equipes e regras de SLA de `json/helpdesk.json` são inseridas somente quando não existem. Chamados de exemplo não são importados para o banco.

## Desenvolvimento no Windows

Na raiz que contém `package.json`, copie `.env.example` para `.env`, configure `DATABASE_URL` e, se usar Docker Desktop, execute `docker compose up -d --wait postgres`. O usuário inicial criado pelo Compose é `ponto`, então use `docker compose exec postgres psql -U ponto -d ponto`; não presuma que há um usuário de banco chamado `postgres`. Inicie com `npm.cmd install` e `npm.cmd run dev`.

Para produção, use serviço PostgreSQL gerenciado, TLS, backups, rotação de segredos, política de retenção, verificação de e-mail e revisão de segurança. A versão atual ainda não inclui envio de verificação, redefinição de senha por e-mail nem upload de anexos.
