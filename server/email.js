const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function getAllowedEmailDomains(env = process.env) {
  return [...new Set(String(env.ALLOWED_EMAIL_DOMAINS || '').split(',').map((domain) => domain.trim().toLowerCase()).filter((domain) => DOMAIN_PATTERN.test(domain)))];
}

export function isAllowedEmail(value, domains = getAllowedEmailDomains()) {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) return false;
  const domain = email.split('@').pop();
  return domains.includes(domain);
}
