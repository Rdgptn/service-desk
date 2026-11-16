# Ponto — Central de Atendimento

Help Desk em Node.js/Express e PostgreSQL. Funcionários criam uma conta com e-mail corporativo e senha; cada conta recebe automaticamente um ID interno no banco e começa como solicitante. Só admins veem fila, chamados, relatórios e configurações.

## Rodar no Windows pelo VS Code

Abra no VS Code a pasta do projeto que contém `package.json` (dentro da extração do ZIP, pode haver uma pasta com o mesmo nome). Confira com `Get-ChildItem package.json`. Requisitos: Node.js 20+ e PostgreSQL. Se usar Docker Desktop, abra-o e espere o mecanismo indicar que está pronto.

No terminal PowerShell, copie o modelo e abra o arquivo para preencher:

```powershell
Copy-Item .env.example .env
notepad .env
```

Preencha `ALLOWED_EMAIL_DOMAINS` com o domínio corporativo real, sem `@` (por exemplo, `minhaempresa.com`). Defina `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` para a primeira conta administrativa. A senha inicial deve ter de 12 a 128 caracteres. Também gere um `SESSION_SECRET` aleatório longo. Não use os exemplos literalmente e não envie senhas por este chat.

Em seguida, inicie o PostgreSQL opcional com Docker Compose e o app:

```powershell
docker compose up -d --wait postgres
npm.cmd install
npm.cmd run dev
```

Abra `http://localhost:3000`. Se PowerShell permitir o comando `npm`, `npm install` e `npm run dev` também funcionam. Se já houver um PostgreSQL local, não precisa do Docker; configure `DATABASE_URL` para esse banco e não exponha a porta do banco à internet. A senha do `DATABASE_URL` precisa ser a mesma de `POSTGRES_PASSWORD`; caracteres especiais na senha precisam estar codificados para URL.

Depois do primeiro arranque bem-sucedido, o admin inicial e o hash da senha já estarão no banco. Remova `INITIAL_ADMIN_PASSWORD` do `.env`; a conta continua funcionando e o admin pode trocar a senha dentro do app. `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_NAME` podem permanecer. O esquema é migrado ao iniciar, sem apagar chamados.

Se o container de banco mostrar `password authentication failed`, lembre que alterar `POSTGRES_PASSWORD` no `.env` não troca a senha de um volume Docker que já foi inicializado. O usuário administrador do container é `ponto` (não `postgres`): inspecione com `docker compose exec postgres psql -U ponto -d ponto` e alinhe a senha do banco e a URL antes de iniciar o app.

`npm start` inicia sem modo de observação; `npm run check` confere sintaxe; `npm test` executa os testes. Não é necessário Python.

## Cadastro, login e permissões

Na tela inicial existem as opções **Entrar** e **Criar conta**. O cadastro solicita nome, setor, e-mail corporativo e senha (mínimo de 12 caracteres). O PostgreSQL gera `users.id` automaticamente; o ID não pode ser escolhido no formulário e permanece o mesmo enquanto o registro existir. A senha é armazenada com hash scrypt e salt exclusivo, nunca em texto puro. O primeiro admin é semeado do `.env`; cadastros seguintes começam como `requester` e não podem elevar o próprio papel.

O perfil solicitante acessa somente a abertura de chamado e as categorias necessárias ao formulário. Os endpoints de fila, lista/detalhe de chamados, comentários, relatórios e administração exigem `admin` também no servidor. Um admin pode conceder perfil admin a um usuário já cadastrado ou pré-autorizar o e-mail corporativo para que a conta receba esse papel ao se cadastrar.

`ALLOWED_EMAIL_DOMAINS` aceita um ou mais domínios exatos, separados por vírgula. Essa lista restringe o cadastro, mas **não confirma que a pessoa controla a caixa postal**. Até que a empresa configure verificação de e-mail, mantenha o sistema em rede interna e confirme a identidade por canal corporativo antes de conceder admin. Esta versão não envia convites nem e-mails de verificação. Também não tem fluxo de “esqueci minha senha”; usuários autenticados podem trocar a própria senha, e a recuperação de conta precisa ser feita pela equipe responsável pelo banco em um procedimento seguro.

A sessão usa cookie `HttpOnly`, rotação após login, token CSRF para mutações e limite de tentativas de autenticação. Para produção, use HTTPS, `SESSION_COOKIE_SECURE=true`, segredo gerenciado, backups, política de retenção, validação de segurança e fluxo de verificação de e-mail. Não exponha a app como serviço público sem essa revisão.

## Banco e limites funcionais

O primeiro arranque cria as tabelas PostgreSQL, categorias e regras de SLA. `json/helpdesk.json` segue separado como fonte de valores iniciais; os chamados reais são persistidos no banco. O campo de anexo, neste protótipo, salva somente o nome informado; não faz upload do arquivo.

## Estrutura

```text
helpdesk/
├── .env.example
├── docker-compose.yml
├── package.json / package-lock.json
├── index.html
├── html/index.html
├── css/app.css
├── js/
│   ├── main.js
│   ├── core/                   # Cliente da API, sessão e CSRF
│   ├── auth/                   # Login local e formulário de cadastro
│   └── features/               # Chamados, painel, relatórios e administração
├── server/
│   ├── server.js               # Express, API e autorização
│   ├── access.js               # Autenticação, admin, CSRF e validação
│   ├── passwords.js            # Hash scrypt com salt individual
│   ├── email.js                # Normalização e domínios permitidos
│   ├── db.js                   # PostgreSQL, usuários e chamados
│   └── schema.sql              # Criação/migração idempotente do esquema
├── json/helpdesk.json          # Sementes de categorias, equipes e SLA
└── database/README.md
```
