CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  entra_oid TEXT,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'requester' CHECK (role IN ('requester', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, entra_oid),
  UNIQUE (tenant_id, email)
);

-- Migração aditiva da versão Entra: os dados anteriores permanecem; novas contas usam identidade local.
ALTER TABLE users ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN entra_oid DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS admin_invites (
  email TEXT PRIMARY KEY,
  granted_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_by BIGINT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  requester_id BIGINT NOT NULL REFERENCES users(id),
  requester_name TEXT NOT NULL,
  department TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(name),
  priority TEXT NOT NULL CHECK (priority IN ('Baixa', 'Média', 'Alta', 'Urgente')),
  status TEXT NOT NULL DEFAULT 'Aberto' CHECK (status IN ('Aberto', 'Em triagem', 'Em atendimento', 'Aguardando solicitante', 'Resolvido')),
  assignee_id BIGINT REFERENCES users(id),
  team TEXT NOT NULL DEFAULT 'Suporte interno',
  attachment_name TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_history (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id BIGINT REFERENCES users(id),
  event TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tickets_status_updated_idx ON tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS tickets_assignee_idx ON tickets(assignee_id, status);
CREATE INDEX IF NOT EXISTS tickets_requester_idx ON tickets(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_ticket_idx ON ticket_comments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS history_ticket_idx ON ticket_history(ticket_id, created_at DESC);
