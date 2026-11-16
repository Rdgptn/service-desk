import { escapeHTML } from '../core/helpers.js';

const STATUS = ['Aberto', 'Em triagem', 'Em atendimento', 'Aguardando solicitante', 'Resolvido'];
const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];

function averageResolutionDays(tickets) {
  const done = tickets.filter((ticket) => ticket.status === 'Resolvido');
  if (!done.length) return '—';
  const days = done.reduce((sum, ticket) => sum + Math.max(0, new Date(ticket.updatedAt) - new Date(ticket.createdAt)) / 86400000, 0) / done.length;
  return days.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function chartRows(items, max, warmFrom = Infinity) {
  return items.map((item, index) => `<div class="chart-row"><span>${escapeHTML(item.label)}</span><div class="chart-track"><div class="chart-fill ${index >= warmFrom ? 'warm' : ''}" style="width:${Math.max(item.count ? 8 : 0, item.count / Math.max(1, max) * 100)}%"></div></div><strong>${item.count}</strong></div>`).join('');
}

export function renderReports(model, pageHeading) {
  const total = model.tickets.length;
  const activeCount = model.tickets.filter((ticket) => ticket.status !== 'Resolvido').length;
  const statusCounts = STATUS.map((label) => ({ label, count: model.tickets.filter((ticket) => ticket.status === label).length }));
  const priorityCounts = PRIORITIES.map((label) => ({ label, count: model.tickets.filter((ticket) => ticket.priority === label).length }));
  const agentCounts = model.agents.map((agent) => ({ label: agent.split(' ')[0], count: model.tickets.filter((ticket) => ticket.status !== 'Resolvido' && ticket.assignee === agent).length }));
  return `${pageHeading('ACOMPANHAMENTO', 'Relatórios', 'Volume de solicitações, distribuição por status e carga por responsável.', false)}
    <div class="report-layout"><section class="panel report-card"><h2>Visão do atendimento</h2><p>Chamados registrados no PostgreSQL</p><div class="report-kpis"><div class="report-kpi"><span>Total de chamados</span><strong>${total}</strong></div><div class="report-kpi"><span>Em andamento</span><strong>${activeCount}</strong></div><div class="report-kpi"><span>Tempo médio</span><strong>${averageResolutionDays(model.tickets)}</strong></div></div><h3 class="eyebrow">POR STATUS</h3>${chartRows(statusCounts, Math.max(...statusCounts.map((item) => item.count)), 4)}<p class="report-footnote">Os indicadores são atualizados a partir dos chamados salvos no servidor.</p></section>
    <section class="panel report-card"><h2>Prioridade</h2><p>Distribuição das solicitações cadastradas</p>${chartRows(priorityCounts, Math.max(...priorityCounts.map((item) => item.count)), 2)}<div class="report-footnote">Equipes cadastradas: ${model.teams.map(escapeHTML).join(', ')}.</div></section>
    <section class="panel report-card"><h2>Chamados por responsável</h2><p>Itens em aberto atualmente na fila</p>${chartRows(agentCounts, Math.max(...agentCounts.map((item) => item.count)), 1)}</section>
    <section class="panel report-card"><h2>Base dos indicadores</h2><p>Os dados vêm do PostgreSQL central da empresa. A autenticação e as permissões são conferidas pelo servidor.</p><div class="demo-note">Anexos ainda não são transferidos nem armazenados; o chamado guarda apenas o nome informado.</div></section></div>`;
}
