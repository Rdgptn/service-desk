export function renderRegistrationForm() {
  return `<form id="register-form" class="auth-form" novalidate>
    <label class="field"><span>Nome completo</span><input name="name" type="text" minlength="2" maxlength="120" autocomplete="name" required /></label>
    <label class="field"><span>E-mail corporativo</span><input name="email" type="email" maxlength="254" autocomplete="email" required /></label>
    <label class="field"><span>Setor</span><input name="department" type="text" minlength="2" maxlength="80" autocomplete="organization-title" placeholder="Ex.: Tecnologia da Informação" required /></label>
    <label class="field"><span>Senha</span><input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="password-hint" required /></label>
    <small id="password-hint" class="field-hint">Use pelo menos 12 caracteres. A senha é armazenada como hash no servidor.</small>
    <label class="field"><span>Confirme a senha</span><input name="confirmPassword" type="password" minlength="12" maxlength="128" autocomplete="new-password" required /></label>
    <p id="register-error" class="form-error" role="alert"></p>
    <button class="button button-primary auth-button" type="submit">Criar conta solicitante <span aria-hidden="true">↗</span></button>
  </form>`;
}
