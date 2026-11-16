# Módulos JavaScript

`main.js` consulta a sessão no servidor, apresenta login/cadastro quando anônimo e monta a interface conforme o papel retornado do PostgreSQL. O servidor é a fonte de verdade para identidade, papel e chamados; não há persistência de autenticação em `sessionStorage`.

```text
js/
├── main.js                    # Inicialização, navegação, login/cadastro e formulários
├── core/
│   ├── state.js               # Cliente same-origin da API, cookie e token CSRF
│   └── helpers.js             # Escape HTML, datas, etiquetas e avisos
├── auth/
│   ├── login.js               # Entrada por e-mail e senha
│   └── cadastro.js            # Formulário de conta solicitante
└── features/
    ├── dashboard.js           # Visão geral para admins
    ├── tickets.js              # Lista, filtros, fila e detalhe administrativo
    ├── admin.js                # Categorias, equipes, SLA e concessão de admins
    ├── reports.js              # Indicadores calculados a partir do PostgreSQL
    └── notifications.js        # Avisos de prioridade e SLA para admins
```

Para depurar, confira `core/state.js` quando uma chamada/CSRF falhar; `main.js` para sessão, formulários e navegação; `features/tickets.js` para fila e detalhes; e `features/admin.js` para configurações e concessão de admin. A autorização real está em `server/access.js` e nas rotas de `server/server.js`; esconder controles no navegador não substitui as checagens do servidor.
