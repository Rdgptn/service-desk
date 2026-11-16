import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isValidPassword } from '../server/passwords.js';
import { getAllowedEmailDomains, isAllowedEmail, normalizeEmail } from '../server/email.js';

test('senha é armazenada como hash não reversível com salt individual', async () => {
  const password = 'senha-corporativa-segura-2026';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('senha-incorreta', first), false);
});

test('política de senha aceita 12 a 128 caracteres', () => {
  assert.equal(isValidPassword('123456789012'), true);
  assert.equal(isValidPassword('curta'), false);
  assert.equal(isValidPassword('x'.repeat(129)), false);
});

test('domínios corporativos autorizados são aplicados ao cadastro', () => {
  const domains = getAllowedEmailDomains({ ALLOWED_EMAIL_DOMAINS: 'empresa.com, unidade.empresa.com, EXEMPLO_INVALIDO' });
  assert.deepEqual(domains, ['empresa.com', 'unidade.empresa.com']);
  assert.equal(isAllowedEmail('RODRIGO@EMPRESA.COM', domains), true);
  assert.equal(isAllowedEmail('rodrigo@outro.com', domains), false);
  assert.equal(normalizeEmail('  Rodrigo@Empresa.com '), 'rodrigo@empresa.com');
});
