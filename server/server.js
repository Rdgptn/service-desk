import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import {
  pool, initializeDatabase, getUserById, findLocalUserByEmail, createLocalUser, updateUserPassword,
  listCategories, createCategory, deleteCategory, saveAdminSettings, createTicket,
  getAdminData, updateTicket, addTicketComment, grantAdmin, closeDatabase,
} from './db.js';
import { requireAuthentication, requireAdmin, requireCsrf, validateRegistrationInput, validateTicketInput } from './access.js';
import { hashPassword, getDummyPasswordHash, isValidPassword, verifyPassword } from './passwords.js';
import { isAllowedEmail, normalizeEmail } from './email.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const app = express();
const sessionName = 'ponto.sid';
const cookieSameSite = String(process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
const cookieSecure = process.env.SESSION_COOKIE_SECURE === 'true';
const trustProxy = Number(process.env.TRUST_PROXY || 0);

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
}

function secureCookieConfig() {
  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: String(user.id),
    name: user.display_name,
    email: user.email,
    department: user.department || '',
    role: user.role,
  };
}

async function establishSession(req, user) {
  await regenerateSession(req);
  req.session.userId = String(user.id);
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  await saveSession(req);
  return publicUser(user);
}

app.disable('x-powered-by');
app.set('trust proxy', trustProxy);
app.use(helmet({
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '32kb', type: 'application/json' }));
const PgStore = pgSession(session);
app.use(session({
  name: sessionName,
  store: new PgStore({ pool, tableName: 'ponto_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'invalid-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: trustProxy > 0,
  cookie: secureCookieConfig(),
}));

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/') || !req.session?.userId) return next();
  try {
    req.user = await getUserById(req.session.userId);
    if (!req.user) req.session.destroy(() => {});
    return next();
  } catch (error) {
    return next(error);
  }
});

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
});
const mutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

app.get('/healthz', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.get('/api/session', async (req, res) => {
  req.session.csrfToken ||= crypto.randomBytes(32).toString('hex');
  await saveSession(req);
  res.json({ user: publicUser(req.user), csrfToken: req.session.csrfToken });
});

app.post('/api/auth/register', loginLimiter, requireCsrf, async (req, res) => {
  const { valid, account, errors } = validateRegistrationInput(req.body);
  if (!valid) return res.status(400).json({ error: errors[0], errors });
  if (!isAllowedEmail(account.email)) return res.status(403).json({ error: 'Use um endereço de um domínio corporativo autorizado.' });
  const passwordHash = await hashPassword(account.password);
  try {
    const user = await createLocalUser({
      email: account.email,
      name: account.name,
      department: account.department,
      passwordHash,
    });
    const signedInUser = await establishSession(req, user);
    return res.status(201).json({ user: signedInUser, csrfToken: req.session.csrfToken });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: error.message || 'Já existe uma conta com esse e-mail.' });
    if (/domínio corporativo/i.test(error.message)) return res.status(403).json({ error: error.message });
    throw error;
  }
});

app.post('/api/auth/login', loginLimiter, requireCsrf, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (email.length > 254 || password.length > 128) return res.status(400).json({ error: 'E-mail ou senha inválidos.' });
  const user = await findLocalUserByEmail(email);
  const storedHash = user?.password_hash || await getDummyPasswordHash();
  const passwordMatches = await verifyPassword(password, storedHash);
  if (!user || !passwordMatches || !isAllowedEmail(email)) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  const signedInUser = await establishSession(req, user);
  res.json({ user: signedInUser, csrfToken: req.session.csrfToken });
});

app.post('/api/auth/change-password', mutationLimiter, requireAuthentication, requireCsrf, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';
  const account = await findLocalUserByEmail(req.user.email);
  if (!account || !await verifyPassword(currentPassword, account.password_hash)) {
    return res.status(400).json({ error: 'A senha atual não confere.' });
  }
  if (!isValidPassword(newPassword)) return res.status(400).json({ error: 'A nova senha precisa ter entre 12 e 128 caracteres.' });
  if (newPassword !== confirmPassword) return res.status(400).json({ error: 'As novas senhas não conferem.' });
  await updateUserPassword(req.user.id, await hashPassword(newPassword));
  await establishSession(req, req.user);
  res.json({ ok: true, csrfToken: req.session.csrfToken });
});

app.get('/api/categories', requireAuthentication, async (_req, res) => {
  res.json({ categories: await listCategories() });
});

app.get('/api/admin/data', requireAuthentication, requireAdmin, async (_req, res) => {
  res.json(await getAdminData());
});

app.post('/api/tickets', mutationLimiter, requireAuthentication, requireCsrf, async (req, res) => {
  const { valid, ticket, errors } = validateTicketInput(req.body);
  if (!valid) return res.status(400).json({ error: errors[0], errors });
  try {
    const created = await createTicket({ user: req.user, ...ticket });
    return res.status(201).json({ ticket: created });
  } catch (error) {
    if (/categoria/i.test(error.message)) return res.status(400).json({ error: error.message });
    throw error;
  }
});

app.patch('/api/tickets/:code', mutationLimiter, requireAuthentication, requireAdmin, requireCsrf, async (req, res) => {
  const allowed = ['status', 'priority', 'assigneeId'];
  if (!req.body || !Object.keys(req.body).length || Object.keys(req.body).some((key) => !allowed.includes(key))) {
    return res.status(400).json({ error: 'A alteração do chamado não contém campos permitidos.' });
  }
  if (req.body.status !== undefined && !['Aberto', 'Em triagem', 'Em atendimento', 'Aguardando solicitante', 'Resolvido'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Status inválido.' });
  }
  if (req.body.priority !== undefined && !['Baixa', 'Média', 'Alta', 'Urgente'].includes(req.body.priority)) {
    return res.status(400).json({ error: 'Prioridade inválida.' });
  }
  await updateTicket(req.params.code, req.user.id, req.body);
  res.json({ ok: true });
});

app.post('/api/tickets/:code/comments', mutationLimiter, requireAuthentication, requireAdmin, requireCsrf, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (text.length < 1 || text.length > 1000) return res.status(400).json({ error: 'O comentário deve ter entre 1 e 1.000 caracteres.' });
  await addTicketComment(req.params.code, req.user, text);
  res.status(201).json({ ok: true });
});

app.post('/api/admin/categories', mutationLimiter, requireAuthentication, requireAdmin, requireCsrf, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 50) return res.status(400).json({ error: 'A categoria precisa ter entre 2 e 50 caracteres.' });
  try {
    await createCategory(name);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Essa categoria já existe.' });
    throw error;
  }
  res.status(201).json({ ok: true });
});

app.delete('/api/admin/categories', mutationLimiter, requireAuthentication, requireAdmin, requireCsrf, async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  const categories = await listCategories();
  if (categories.length <= 1) return res.status(400).json({ error: 'Mantenha pelo menos uma categoria.' });
  const result = await deleteCategory(name);
  if (result.reason === 'used') return res.status(409).json({ error: 'Essa categoria já está vinculada a um chamado.' });
  if (!result.deleted) return res.status(404).json({ error: 'Categoria não encontrada.' });
  res.json({ ok: true });
});

app.put('/api/admin/settings', mutationLimiter, requireAuthentication, requireAdmin, requireCsrf, async (req, res) => {
  const teams = Array.isArray(req.body?.teams)
    ? [...new Set(req.body.teams.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, 20)
    : [];
  if (!teams.length || teams.some((item) => item.length > 60)) return res.status(400).json({ error: 'Informe ao menos uma equipe; cada nome pode ter até 60 caracteres.' });
  const sla = {};
  for (const priority of ['Baixa', 'Média', 'Alta', 'Urgente']) {
    const value = typeof req.body?.sla?.[priority] === 'string' ? req.body.sla[priority].trim().slice(0, 40) : '';
    if (!value) return res.status(400).json({ error: `Informe o prazo de SLA para ${priority}.` });
    sla[priority] = value;
  }
  await saveAdminSettings({ teams, sla });
  res.json({ ok: true });
});

app.get('/api/admin/admins', requireAuthentication, requireAdmin, async (_req, res) => {
  const data = await getAdminData();
  res.json({ admins: data.admins, pending: data.pendingAdminInvites });
});

app.post('/api/admin/admins', mutationLimiter, requireAuthentication, requireAdmin, requireCsrf, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Informe um e-mail corporativo válido.' });
  if (!isAllowedEmail(email)) return res.status(400).json({ error: 'Use um endereço de um domínio corporativo autorizado.' });
  const result = await grantAdmin(email, req.user.id);
  res.status(result.active ? 200 : 201).json({
    ok: true,
    active: result.active,
    message: result.active ? 'Acesso administrativo concedido.' : 'Pré-autorização registrada; a conta receberá o papel admin ao se cadastrar com esse e-mail.',
  });
});

app.post('/api/auth/logout', requireAuthentication, requireCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(sessionName, { ...secureCookieConfig(), maxAge: undefined });
    return res.json({ ok: true });
  });
});

app.get(['/','/html/index.html'], (_req, res) => res.sendFile(path.join(projectRoot, 'html/index.html')));
app.use('/css', express.static(path.join(projectRoot, 'css'), { index: false, fallthrough: false }));
app.use('/js', express.static(path.join(projectRoot, 'js'), { index: false, fallthrough: false }));
app.use('/assets', express.static(path.join(projectRoot, 'assets'), { index: false, fallthrough: false }));
app.get('/manus-routes.json', (_req, res) => res.sendFile(path.join(projectRoot, 'manus-routes.json')));
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota não encontrada.' });
  return res.status(404).send('Página não encontrada.');
});
app.use((error, _req, res, _next) => {
  console.error('Erro na aplicação:', error.message);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Ocorreu um erro no servidor. Tente novamente ou fale com a equipe de TI.' });
});

export async function startServer() {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no .env para conectar ao PostgreSQL.');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.startsWith('SUBSTITUA-')) {
    throw new Error('Configure SESSION_SECRET com pelo menos 32 caracteres aleatórios no .env.');
  }
  if (!['lax', 'strict', 'none'].includes(cookieSameSite)) throw new Error('SESSION_COOKIE_SAMESITE deve ser lax, strict ou none.');
  if (cookieSameSite === 'none' && !cookieSecure) throw new Error('SESSION_COOKIE_SAMESITE=none exige SESSION_COOKIE_SECURE=true.');
  if (process.env.NODE_ENV === 'production' && !cookieSecure) throw new Error('Em produção, configure SESSION_COOKIE_SECURE=true para proteger o cookie de sessão.');
  await initializeDatabase();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Ponto Help Desk disponível em http://localhost:${port}`);
    console.log(`Domínios de cadastro permitidos: ${process.env.ALLOWED_EMAIL_DOMAINS}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch(async (error) => {
    console.error(`Não foi possível iniciar o Help Desk: ${error.message}`);
    await closeDatabase().catch(() => {});
    process.exitCode = 1;
  });
}

export { app };
