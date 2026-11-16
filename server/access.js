import { timingSafeEqual } from 'node:crypto';
import { isValidEmail, normalizeEmail } from './email.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './passwords.js';

export function requireAuthentication(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Entre com seu e-mail e senha para continuar.' });
}

export function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  return res.status(403).json({ error: 'Esta área está disponível somente para administradores.' });
}

export function requireCsrf(req, res, next) {
  const expected = String(req.session?.csrfToken || '');
  const received = String(req.get('x-csrf-token') || '');
  if (!expected || !received) return res.status(403).json({ error: 'Token de segurança ausente. Atualize a página e tente novamente.' });
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return res.status(403).json({ error: 'Token de segurança inválido. Atualize a página e tente novamente.' });
  }
  return next();
}

export function validateRegistrationInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const email = normalizeEmail(body?.email);
  const department = typeof body?.department === 'string' ? body.department.trim().slice(0, 80) : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';
  const errors = [];
  if (name.length < 2) errors.push('Informe seu nome completo.');
  if (!isValidEmail(email)) errors.push('Informe um e-mail válido.');
  if (department.length < 2) errors.push('Informe seu setor.');
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) errors.push(`A senha precisa ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres.`);
  if (password !== confirmPassword) errors.push('As senhas não conferem.');
  return { valid: errors.length === 0, account: { name, email, department, password }, errors };
}

export function validateTicketInput(body) {
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const ticket = {
    requesterName: text(body?.requesterName, 100),
    department: text(body?.department, 80),
    subject: text(body?.subject, 100),
    description: text(body?.description, 1500),
    category: text(body?.category, 60),
    priority: text(body?.priority, 20),
    attachmentName: text(body?.attachmentName, 255),
  };
  const errors = [];
  if (ticket.requesterName.length < 2) errors.push('Informe o nome do solicitante.');
  if (ticket.department.length < 2) errors.push('Informe o setor do solicitante.');
  if (ticket.subject.length < 3) errors.push('O assunto precisa ter pelo menos 3 caracteres.');
  if (ticket.description.length < 5) errors.push('A descrição precisa ter pelo menos 5 caracteres.');
  if (!ticket.category) errors.push('Selecione uma categoria.');
  if (!['Baixa', 'Média', 'Alta', 'Urgente'].includes(ticket.priority)) errors.push('Selecione uma prioridade válida.');
  return { valid: errors.length === 0, ticket, errors };
}
