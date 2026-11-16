import { escapeHTML } from '../core/helpers.js';

export function renderNotifications(tickets) {
  const active = tickets.filter((ticket) => ticket.status !== 'Resolvido');
  const notifications = active.map((ticket) => {
    const hoursLeft = ticket.dueAt ? (new Date(ticket.dueAt).getTime() - Date.now()) / 3600000 : Infinity;
    if (!['Urgente', 'Alta'].includes(ticket.priority) && hoursLeft > 8) return null;
    const label = hoursLeft < 0 ? 'Prazo vencido' : hoursLeft <= 8 ? 'Prazo próximo' : `Prioridade ${ticket.priority.toLowerCase()}`;
    return { ticket, label, hoursLeft };
  }).filter(Boolean).sort((a, b) => a.hoursLeft - b.hoursLeft).slice(0, 5);
  return `<h3>Notificações</h3>${notifications.length ? notifications.map(({ ticket, label }) => `<button class="notification-item" type="button" data-action="open-ticket" data-id="${escapeHTML(ticket.id)}"><strong>${escapeHTML(ticket.id)} · ${escapeHTML(label)}</strong><p>${escapeHTML(ticket.subject)}</p></button>`).join('') : '<div class="empty-state">Sem novos avisos.</div>'}<p class="report-footnote">Chamados de prioridade alta e prazos em até 8 horas, calculados com os dados atuais.</p>`;
}
