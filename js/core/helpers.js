export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date).replace('.', '');
}

export function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

export function statusClass(status) {
  return ({ 'Aberto': 'status-open', 'Em triagem': 'status-triage', 'Em atendimento': 'status-progress', 'Aguardando solicitante': 'status-waiting', 'Resolvido': 'status-resolved' })[status] || 'status-triage';
}

export function priorityClass(priority) {
  return `priority-${String(priority || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()}`;
}

export function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}">${escapeHTML(status)}</span>`;
}

export function priorityPill(priority) {
  return `<span class="priority-pill ${priorityClass(priority)}">${escapeHTML(priority || 'Média')}</span>`;
}

export function showToast(message) {
  const region = document.querySelector('#toast-region');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 3800);
}

export function addHistory(ticket, text) {
  ticket.history ||= [];
  ticket.history.push({ text, at: new Date().toISOString() });
}
