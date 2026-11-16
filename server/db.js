import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword, isValidPassword } from './passwords.js';
import { isAllowedEmail, isValidEmail, normalizeEmail } from './email.js';

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : undefined,
});

const STATUS = ['Aberto', 'Em triagem', 'Em atendimento', 'Aguardando solicitante', 'Resolvido'];
const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];

export async function initializeDatabase() {
  const schema = await readFile(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(schema);
  const seed = JSON.parse(await readFile(path.join(here, '../json/helpdesk.json'), 'utf8'));
  for (const category of seed.categories) {
    await pool.query('INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO NOTHING', [category]);
  }
  await pool.query(
    `INSERT INTO app_settings(key, value) VALUES('teams', $1::jsonb), ('sla', $2::jsonb)
     ON CONFLICT(key) DO NOTHING`,
    [JSON.stringify(seed.teams), JSON.stringify(seed.sla)],
  );
  await ensureInitialAdmin();
}

async function ensureInitialAdmin() {
  if (!process.env.ALLOWED_EMAIL_DOMAINS || !process.env.ALLOWED_EMAIL_DOMAINS.trim()) {
    throw new Error('Configure ALLOWED_EMAIL_DOMAINS com o domínio corporativo antes do primeiro acesso.');
  }
  const ready = await pool.query("SELECT id FROM users WHERE role = 'admin' AND password_hash IS NOT NULL LIMIT 1");
  if (ready.rowCount) return;
  const email = normalizeEmail(process.env.INITIAL_ADMIN_EMAIL);
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (!isValidEmail(email) || !isAllowedEmail(email)) {
    throw new Error('Configure INITIAL_ADMIN_EMAIL com um e-mail de um domínio listado em ALLOWED_EMAIL_DOMAINS.');
  }
  if (!isValidPassword(password)) {
    throw new Error('Configure INITIAL_ADMIN_PASSWORD com uma senha inicial de 12 a 128 caracteres.');
  }
  const passwordHash = await hashPassword(password);
  const existing = await pool.query('SELECT id, display_name FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
  const displayName = String(process.env.INITIAL_ADMIN_NAME || existing.rows[0]?.display_name || email.split('@')[0]).trim().slice(0, 120);
  if (existing.rowCount) {
    await pool.query(
      `UPDATE users SET tenant_id = NULL, entra_oid = NULL, display_name = $1, password_hash = $2,
       role = 'admin', updated_at = NOW() WHERE id = $3`,
      [displayName, passwordHash, existing.rows[0].id],
    );
  } else {
    await pool.query(
      `INSERT INTO users(tenant_id, entra_oid, email, display_name, department, password_hash, role)
       VALUES(NULL, NULL, $1, $2, '', $3, 'admin')`,
      [email, displayName, passwordHash],
    );
  }
}

export async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, email, display_name, department, role FROM users WHERE id = $1', [id],
  );
  return rows[0] || null;
}

export async function findLocalUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, email, display_name, department, password_hash, role FROM users WHERE LOWER(email) = $1',
    [normalizeEmail(email)],
  );
  return rows[0] || null;
}

export async function createLocalUser({ email, name, department, passwordHash }) {
  const normalizedEmail = normalizeEmail(email);
  if (!isAllowedEmail(normalizedEmail)) throw new Error('Use um e-mail de domínio corporativo autorizado.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM users WHERE LOWER(email) = $1 FOR UPDATE', [normalizedEmail]);
    if (existing.rowCount) {
      const duplicate = new Error('Já existe uma conta com esse e-mail. Entre ou fale com um administrador.');
      duplicate.code = '23505';
      throw duplicate;
    }
    const invite = await client.query('SELECT email FROM admin_invites WHERE LOWER(email) = $1 FOR UPDATE', [normalizedEmail]);
    const role = invite.rowCount ? 'admin' : 'requester';
    const inserted = await client.query(
      `INSERT INTO users(tenant_id, entra_oid, email, display_name, department, password_hash, role)
       VALUES(NULL, NULL, $1, $2, $3, $4, $5)
       RETURNING id, email, display_name, department, role`,
      [normalizedEmail, name, department, passwordHash, role],
    );
    const user = inserted.rows[0];
    if (invite.rowCount) await client.query('UPDATE admin_invites SET accepted_by = $1 WHERE LOWER(email) = $2', [user.id, normalizedEmail]);
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUserPassword(userId, passwordHash) {
  await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
}

export async function listCategories() {
  const { rows } = await pool.query('SELECT name FROM categories ORDER BY name');
  return rows.map((row) => row.name);
}

export async function createCategory(name) {
  await pool.query('INSERT INTO categories(name) VALUES($1)', [name]);
}

export async function deleteCategory(name) {
  const used = await pool.query('SELECT 1 FROM tickets WHERE category = $1 LIMIT 1', [name]);
  if (used.rowCount) return { deleted: false, reason: 'used' };
  const result = await pool.query('DELETE FROM categories WHERE name = $1', [name]);
  return { deleted: result.rowCount > 0, reason: result.rowCount ? null : 'missing' };
}

async function getSetting(key, fallback) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? fallback;
}

export async function saveAdminSettings({ teams, sla }) {
  await pool.query(
    `INSERT INTO app_settings(key, value) VALUES('teams', $1::jsonb), ('sla', $2::jsonb)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(teams), JSON.stringify(sla)],
  );
}

function addSla(createdAt, raw) {
  const normalized = String(raw || '2 dias úteis').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(horas?|h|dias?|d)\b/);
  if (!match) return new Date(createdAt.getTime() + 2 * 86400000);
  const amount = Math.min(3650, Math.max(0, Number(match[1].replace(',', '.'))));
  if (match[2].startsWith('h')) return new Date(createdAt.getTime() + amount * 3600000);
  if (!normalized.includes('util')) return new Date(createdAt.getTime() + amount * 86400000);
  const due = new Date(createdAt);
  let remaining = Math.floor(amount);
  while (remaining > 0) {
    due.setDate(due.getDate() + 1);
    if (due.getDay() !== 0 && due.getDay() !== 6) remaining -= 1;
  }
  if (amount % 1) due.setTime(due.getTime() + amount % 1 * 86400000);
  return due;
}

export async function createTicket({ user, requesterName, department, subject, description, category, priority, attachmentName }) {
  const categories = await listCategories();
  if (!categories.includes(category)) throw new Error('Selecione uma categoria válida.');
  const sla = await getSetting('sla', {});
  const teams = await getSetting('teams', ['Suporte interno']);
  const createdAt = new Date();
  const dueAt = addSla(createdAt, sla[priority]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO tickets(requester_id, requester_name, department, subject, description, category, priority, team, attachment_name, due_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [user.id, requesterName, department, subject, description, category, priority, teams[0] || 'Suporte interno', attachmentName || '', dueAt],
    );
    const id = inserted.rows[0].id;
    const code = `HD-${String(id).padStart(5, '0')}`;
    await client.query('UPDATE tickets SET code = $1 WHERE id = $2', [code, id]);
    await client.query(
      'INSERT INTO ticket_history(ticket_id, actor_id, event) VALUES($1,$2,$3)',
      [id, user.id, `Chamado aberto por ${requesterName} · ${department}`],
    );
    await client.query('COMMIT');
    return { id: code, dueAt: dueAt.toISOString() };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getAdminData() {
  const [ticketResult, categoryResult, userResult, inviteResult] = await Promise.all([
    pool.query(
      `SELECT t.*, a.display_name AS assignee_name, a.id AS assignee_user_id, r.email AS requester_email
       FROM tickets t LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN users r ON r.id = t.requester_id ORDER BY t.updated_at DESC`,
    ),
    pool.query('SELECT name FROM categories ORDER BY name'),
    pool.query("SELECT id, display_name, email FROM users WHERE role = 'admin' ORDER BY display_name"),
    pool.query('SELECT email, created_at FROM admin_invites WHERE accepted_by IS NULL ORDER BY email'),
  ]);
  const ticketIds = ticketResult.rows.map((ticket) => ticket.id);
  const [comments, history] = ticketIds.length ? await Promise.all([
    pool.query('SELECT ticket_id, author_name, body, created_at FROM ticket_comments WHERE ticket_id = ANY($1::bigint[]) ORDER BY created_at', [ticketIds]),
    pool.query('SELECT ticket_id, event, created_at FROM ticket_history WHERE ticket_id = ANY($1::bigint[]) ORDER BY created_at DESC', [ticketIds]),
  ]) : [{ rows: [] }, { rows: [] }];
  const byTicket = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const list = map.get(String(row.ticket_id)) || [];
      list.push(row);
      map.set(String(row.ticket_id), list);
    }
    return map;
  };
  const commentsByTicket = byTicket(comments.rows);
  const historyByTicket = byTicket(history.rows);
  const tickets = ticketResult.rows.map((ticket) => ({
    id: ticket.code,
    subject: ticket.subject,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    requester: ticket.requester_name,
    department: ticket.department,
    requesterEmail: ticket.requester_email || '',
    assignee: ticket.assignee_name || '',
    assigneeId: ticket.assignee_user_id ? String(ticket.assignee_user_id) : '',
    team: ticket.team,
    attachmentName: ticket.attachment_name,
    createdAt: new Date(ticket.created_at).toISOString(),
    updatedAt: new Date(ticket.updated_at).toISOString(),
    dueAt: ticket.due_at ? new Date(ticket.due_at).toISOString() : null,
    comments: (commentsByTicket.get(String(ticket.id)) || []).map((comment) => ({ author: comment.author_name, text: comment.body, at: new Date(comment.created_at).toISOString() })),
    history: (historyByTicket.get(String(ticket.id)) || []).map((event) => ({ text: event.event, at: new Date(event.created_at).toISOString() })),
  }));
  const categories = categoryResult.rows.map((row) => row.name);
  const agents = userResult.rows.map((user) => ({ id: String(user.id), name: user.display_name, email: user.email }));
  const teams = await getSetting('teams', ['Suporte interno', 'Infraestrutura', 'Sistemas']);
  const sla = await getSetting('sla', { Urgente: '4 horas', Alta: '8 horas', Média: '2 dias úteis', Baixa: '5 dias úteis' });
  return {
    tickets,
    categories,
    teams,
    sla,
    agents: agents.map((agent) => agent.name),
    agentOptions: agents,
    admins: userResult.rows.map((user) => ({ id: String(user.id), name: user.display_name, email: user.email, status: 'Ativo' })),
    pendingAdminInvites: inviteResult.rows.map((invite) => ({ email: invite.email, status: 'Aguardando cadastro' })),
  };
}

export async function updateTicket(code, actorId, changes) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT id, status, priority, assignee_id FROM tickets WHERE code = $1 FOR UPDATE', [code]);
    if (!found.rowCount) throw new Error('Chamado não encontrado.');
    const ticket = found.rows[0];
    const updates = [];
    const values = [];
    if (changes.status !== undefined && STATUS.includes(changes.status) && ticket.status !== changes.status) {
      values.push(changes.status); updates.push(`status = $${values.length}`);
      await client.query('INSERT INTO ticket_history(ticket_id, actor_id, event) VALUES($1,$2,$3)', [ticket.id, actorId, `Status alterado para ${changes.status}`]);
    }
    if (changes.priority !== undefined && PRIORITIES.includes(changes.priority) && ticket.priority !== changes.priority) {
      values.push(changes.priority); updates.push(`priority = $${values.length}`);
      await client.query('INSERT INTO ticket_history(ticket_id, actor_id, event) VALUES($1,$2,$3)', [ticket.id, actorId, `Prioridade alterada para ${changes.priority}`]);
    }
    if (changes.assigneeId !== undefined) {
      const nextId = changes.assigneeId === null || changes.assigneeId === '' ? null : Number(changes.assigneeId);
      if (nextId !== null) {
        const assignee = await client.query("SELECT id, display_name FROM users WHERE id = $1 AND role = 'admin'", [nextId]);
        if (!assignee.rowCount) throw new Error('Selecione um administrador ativo para atribuir o chamado.');
        if (String(ticket.assignee_id || '') !== String(nextId)) {
          values.push(nextId); updates.push(`assignee_id = $${values.length}`);
          await client.query('INSERT INTO ticket_history(ticket_id, actor_id, event) VALUES($1,$2,$3)', [ticket.id, actorId, `Atribuído a ${assignee.rows[0].display_name}`]);
        }
      } else if (ticket.assignee_id) {
        values.push(null); updates.push(`assignee_id = $${values.length}`);
        await client.query('INSERT INTO ticket_history(ticket_id, actor_id, event) VALUES($1,$2,$3)', [ticket.id, actorId, 'Chamado desatribuído']);
      }
    }
    if (updates.length) {
      values.push(ticket.id);
      await client.query(`UPDATE tickets SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function addTicketComment(code, actor, text) {
  const result = await pool.query('SELECT id FROM tickets WHERE code = $1', [code]);
  if (!result.rowCount) throw new Error('Chamado não encontrado.');
  const ticketId = result.rows[0].id;
  await pool.query(
    'INSERT INTO ticket_comments(ticket_id, author_id, author_name, body) VALUES($1,$2,$3,$4)',
    [ticketId, actor.id, actor.display_name, text],
  );
  await pool.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);
  await pool.query('INSERT INTO ticket_history(ticket_id, actor_id, event) VALUES($1,$2,$3)', [ticketId, actor.id, `Comentário adicionado por ${actor.display_name}`]);
}

export async function grantAdmin(email, actorId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const normalizedEmail = normalizeEmail(email);
    const active = await client.query('SELECT id, display_name FROM users WHERE LOWER(email) = $1 FOR UPDATE', [normalizedEmail]);
    if (active.rowCount) {
      await client.query("UPDATE users SET role = 'admin', updated_at = NOW() WHERE id = $1", [active.rows[0].id]);
      await client.query(
        `INSERT INTO admin_invites(email, granted_by, accepted_by) VALUES($1,$2,$3)
         ON CONFLICT(email) DO UPDATE SET granted_by = EXCLUDED.granted_by, accepted_by = EXCLUDED.accepted_by`,
        [normalizedEmail, actorId, active.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO admin_invites(email, granted_by, accepted_by) VALUES($1,$2,NULL)
         ON CONFLICT(email) DO UPDATE SET granted_by = EXCLUDED.granted_by, created_at = NOW(), accepted_by = NULL`,
        [normalizedEmail, actorId],
      );
    }
    await client.query('COMMIT');
    return { active: active.rowCount > 0, name: active.rows[0]?.display_name || null };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  await pool.end();
}
