import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAuthentication, requireAdmin, requireCsrf, validateRegistrationInput, validateTicketInput } from '../server/access.js';

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('rota protegida rejeita solicitante sem perfil admin', () => {
  const req = { user: { id: '12', role: 'requester' } };
  const res = responseRecorder();
  let continued = false;
  requireAdmin(req, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 403);
});

test('admin autenticado pode prosseguir para rota administrativa', () => {
  const req = { user: { id: '1', role: 'admin' } };
  const res = responseRecorder();
  let continued = false;
  requireAdmin(req, res, () => { continued = true; });
  assert.equal(continued, true);
});

test('usuário sem sessão não pode prosseguir', () => {
  const res = responseRecorder();
  let continued = false;
  requireAuthentication({ user: null }, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 401);
});

test('mutação exige token CSRF válido', () => {
  const good = responseRecorder();
  let continued = false;
  requireCsrf({ session: { csrfToken: 'token-abc' }, get: () => 'token-abc' }, good, () => { continued = true; });
  assert.equal(continued, true);
  const bad = responseRecorder();
  requireCsrf({ session: { csrfToken: 'token-abc' }, get: () => 'token-xyz' }, bad, () => { throw new Error('Não deve continuar'); });
  assert.equal(bad.statusCode, 403);
});

test('cadastro local normaliza email, valida senha e confirma os campos', () => {
  const result = validateRegistrationInput({ name: 'Rodrigo Silva', email: 'RODRIGO@empresa.com', department: 'TI', password: 'senha-segura-com-12', confirmPassword: 'senha-segura-com-12' });
  assert.equal(result.valid, true);
  assert.equal(result.account.email, 'rodrigo@empresa.com');
  const short = validateRegistrationInput({ name: 'Rodrigo', email: 'rodrigo@empresa.com', department: 'TI', password: 'curta', confirmPassword: 'curta' });
  assert.equal(short.valid, false);
  assert.ok(short.errors.some((error) => error.includes('12')));
  const mismatch = validateRegistrationInput({ name: 'Rodrigo', email: 'rodrigo@empresa.com', department: 'TI', password: 'senha-segura-com-12', confirmPassword: 'outra-senha-segura' });
  assert.ok(mismatch.errors.includes('As senhas não conferem.'));
});

test('abertura do chamado exige nome do solicitante e setor', () => {
  const result = validateTicketInput({ requesterName: '', department: '', subject: 'Erro', description: 'Não consigo acessar', category: 'Acesso e contas', priority: 'Alta' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('Informe o nome do solicitante.'));
  assert.ok(result.errors.includes('Informe o setor do solicitante.'));
});
