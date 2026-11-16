# Entregáveis

- [x] Preservar as funções administrativas existentes: visão geral, fila, busca/filtros/ordenação, consulta de chamados, comentários/histórico, indicadores, relatórios, categorias, equipes, SLA e notificações.
- [x] Manter HTML, CSS, JavaScript e JSON separados e JavaScript em módulos; executar com npm/Node e PostgreSQL.
- [x] Manter o controle de acesso no servidor: solicitantes só abrem chamados; fila, demais chamados, relatórios e configurações são exclusivos de admins.
- [x] Manter o fluxo de administração: somente um admin pode conceder perfil admin a outro usuário; a conta comum não pode escolher nem elevar seu próprio papel.
- [x] Substituir o login Microsoft Entra por cadastro/entrada próprios com e-mail e senha, acessíveis na tela inicial, sem exigir que funcionários registrem um aplicativo Microsoft.
- [x] Ao concluir cadastro, gravar o usuário no PostgreSQL com `users.id` gerado automaticamente e estável até exclusão; cada novo cadastro recebe o papel solicitante, nunca admin por escolha própria; o ID é exibido no perfil.
- [x] Guardar apenas hash scrypt com salt individual, nunca senha em texto puro; limitar cadastros aos domínios corporativos configurados; proteger login, cadastro e sessões com limite de tentativas, CSRF, cookies HttpOnly e rotação de sessão.
- [x] Provisionar o primeiro admin por configuração server-side; manter a concessão de admins posteriores sob autorização admin e preservar o acesso restrito às áreas administrativas.
- [x] Migrar o esquema de forma aditiva, sem apagar chamados ou histórico existentes; atualizar `.env.example`, README e telas para remover o fluxo/rotas de login Entra.
- [x] Validar cadastro, login, ID gerado/estável, senha, domínio permitido, criação de chamado por solicitante, bloqueio das rotas admin e concessão de admin.

## Limitações a comunicar

Cadastro local não verifica a posse da caixa postal: o filtro restringe domínios, mas não substitui confirmação por e-mail. O sistema também não envia convite ou link de redefinição; contas esquecidas precisam de procedimento administrativo. O anexo ainda registra apenas o nome do arquivo, sem transferir seu conteúdo.
