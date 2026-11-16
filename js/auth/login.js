import { escapeHTML } from '../core/helpers.js';
import { renderRegistrationForm } from './cadastro.js';

export function renderLoginPage({ error = '' } = {}) {
  const errorBlock = error ? `<p class="form-error auth-error" role="alert">${escapeHTML(error)}</p>` : '';
  return `<section class="auth-page"><div class="auth-card">
    <div class="auth-mark" aria-hidden="true"><span class="brand-mark"><i></i><i></i><i></i></span></div>
    <p class="eyebrow">PONTO · CENTRAL DE ATENDIMENTO</p>
    <h1>Suporte da empresa, em um só lugar.</h1>
    <p class="auth-intro">Entre com seu e-mail corporativo para abrir uma solicitação ou acessar as ferramentas de atendimento.</p>
    ${errorBlock}
    <div class="auth-tabs" role="tablist" aria-label="Acesso à central">
      <button class="auth-tab is-active" id="tab-login" type="button" role="tab" aria-selected="true" aria-controls="panel-login" data-auth-view="login">Entrar</button>
      <button class="auth-tab" id="tab-register" type="button" role="tab" aria-selected="false" aria-controls="panel-register" data-auth-view="register">Criar conta</button>
    </div>
    <section class="auth-panel" id="panel-login" role="tabpanel" aria-labelledby="tab-login" data-auth-panel="login">
      <form id="login-form" class="auth-form" novalidate>
        <label class="field"><span>E-mail corporativo</span><input name="email" type="email" maxlength="254" autocomplete="username" required /></label>
        <label class="field"><span>Senha</span><input name="password" type="password" autocomplete="current-password" required /></label>
        <p id="login-error" class="form-error" role="alert"></p>
        <button class="button button-primary auth-button" type="submit">Entrar na central <span aria-hidden="true">↗</span></button>
      </form>
      <p class="auth-help">Esqueceu a senha? Peça orientação à equipe de TI; esta versão não envia links de redefinição por e-mail.</p>
    </section>
    <section class="auth-panel" id="panel-register" role="tabpanel" aria-labelledby="tab-register" data-auth-panel="register" hidden>
      ${renderRegistrationForm()}
    </section>
    <p class="auth-note">O cadastro aceita apenas os domínios corporativos configurados. Novas contas começam como solicitantes e só podem abrir chamados. A posse do e-mail ainda não é verificada automaticamente.</p>
  </div></section>`;
}
