import { api, getSession, setCsrfToken } from './core/state.js';
import { escapeHTML, showToast } from './core/helpers.js';
import { renderLoginPage } from './auth/login.js';
import { renderDashboard } from './features/dashboard.js';
import { renderTicketList, renderTicketDetails, STATUS, PRIORITIES } from './features/tickets.js';
import { renderReports } from './features/reports.js';
import { renderAdmin } from './features/admin.js';
import { renderNotifications } from './features/notifications.js';

const app = document.querySelector('#app');
const ticketDialog = document.querySelector('#ticket-dialog');
const ticketDialogContent = document.querySelector('#ticket-dialog-content');
const newTicketDialog = document.querySelector('#new-ticket-dialog');
const newTicketForm = document.querySelector('#new-ticket-form');
const passwordDialog = document.querySelector('#password-dialog');
const passwordForm = document.querySelector('#password-form');
const notificationPanel = document.querySelector('#notification-panel');
const searchInput = document.querySelector('#global-search');
const sectionNames = { overview: 'Visão geral', tickets: 'Todos os chamados', queue: 'Minha fila', reports: 'Relatórios', admin: 'Configurações', requester: 'Abertura de chamado' };

let currentUser = null;
let model = null;
let categories = [];
let activeView = 'overview';
let query = '';
let selectedTicketId = null;
let lastTrigger = null;
let lastCreatedTicket = '';
let sortBy = 'updated';
let filters = { status: 'Todas', priority: 'Todas', category: 'Todas', assignee: 'Todas', period: 'Tudo' };

function pageHeading(eyebrow, title, intro, showAction = true) {
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHTML(eyebrow)}</p><h1>${escapeHTML(title)}</h1><p class="intro">${escapeHTML(intro)}</p></div>${showAction ? '<button class="button button-primary" type="button" data-action="new-ticket">Abrir chamado <span aria-hidden="true">↗</span></button>' : ''}</div>`;
}

function renderAnonymous(error = '') {
  document.body.dataset.role = 'anonymous';
  document.querySelector('#topbar').hidden = true;
  document.querySelector('.primary-nav').hidden = true;
  app.innerHTML = renderLoginPage({ error });
  app.setAttribute('aria-busy', 'false');
}

function updateChrome() {
  const isAdmin = currentUser.role === 'admin';
  document.body.dataset.role = isAdmin ? 'admin' : 'requester';
  document.querySelector('#topbar').hidden = false;
  document.querySelector('.primary-nav').hidden = !isAdmin;
  document.querySelector('#workspace-label').hidden = !isAdmin;
  document.querySelector('#sidebar-note').hidden = !isAdmin;
  document.querySelector('#sidebar-user').hidden = false;
  document.querySelector('#search-wrapper').hidden = !isAdmin;
  document.querySelector('#notification-button').hidden = !isAdmin;
  document.querySelector('#password-button').hidden = false;
  document.querySelector('#logout-button').hidden = false;
  document.querySelector('#current-section').textContent = isAdmin ? sectionNames[activeView] : sectionNames.requester;
  document.querySelector('#sidebar-user-name').textContent = currentUser.name || currentUser.email;
  document.querySelector('#sidebar-user-role').textContent = `${isAdmin ? 'Administrador' : 'Solicitante'} · ID ${currentUser.id}`;
  const initials = String(currentUser.name || currentUser.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  document.querySelector('#sidebar-avatar').textContent = initials || 'U';
  document.querySelector('#top-avatar').textContent = initials || 'U';
}

function populateTicketForm() {
  const categorySelect = document.querySelector('#new-category');
  if (categorySelect) {
    const current = categorySelect.value;
    categorySelect.innerHTML = categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
    if (categories.includes(current)) categorySelect.value = current;
  }
}

function renderRequester() {
  const name = escapeHTML(currentUser.name || currentUser.email);
  app.innerHTML = `<section class="requester-page">${pageHeading('SOLICITAÇÕES', 'Abrir um chamado', `Olá, ${name}. Use este formulário para solicitar suporte à equipe de TI.`, false)}<section class="requester-intro"><div><h2>O que precisa de ajuda?</h2><p>Informe o assunto, o setor e o que aconteceu. A equipe de TI receberá seu chamado para análise.</p></div><button class="button button-primary" type="button" data-action="new-ticket">Preencher solicitação <span aria-hidden="true">↗</span></button></section>${lastCreatedTicket ? `<section class="requester-confirmation" role="status"><strong>Chamado ${escapeHTML(lastCreatedTicket)} aberto</strong><span>A solicitação foi registrada. Para consultar o andamento, fale com a equipe de TI.</span></section>` : ''}</section>`;
  app.setAttribute('aria-busy', 'false');
  populateTicketForm();
}

function render() {
  if (!currentUser) return renderAnonymous();
  updateChrome();
  if (currentUser.role !== 'admin') return renderRequester();
  if (!model) return;
  document.querySelector('#nav-open-count').textContent = String(model.tickets.filter((ticket) => ticket.status !== 'Resolvido').length);
  document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === activeView);
    if (button.dataset.view === activeView) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  if (activeView === 'overview') app.innerHTML = renderDashboard({ model, currentUser });
  else if (activeView === 'tickets' || activeView === 'queue') app.innerHTML = renderTicketList({ model, view: activeView, currentUser, query, filters, sortBy, pageHeading });
  else if (activeView === 'reports') app.innerHTML = renderReports(model, pageHeading);
  else app.innerHTML = renderAdmin(model, pageHeading);
  app.setAttribute('aria-busy', 'false');
  populateTicketForm();
}

async function reloadAdminData() {
  model = await api('/api/admin/data');
  categories = model.categories;
}

async function activateUser(user, csrfToken) {
  currentUser = user;
  setCsrfToken(csrfToken);
  categories = (await api('/api/categories')).categories;
  if (currentUser.role === 'admin') {
    activeView = 'overview';
    await reloadAdminData();
  } else {
    activeView = 'requester';
    model = null;
  }
  render();
}

function switchAuthPanel(view) {
  const selected = view === 'register' ? 'register' : 'login';
  document.querySelectorAll('[data-auth-view]').forEach((button) => {
    const active = button.dataset.authView === selected;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-auth-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.authPanel !== selected;
  });
  document.querySelector(`#panel-${selected} input`)?.focus();
}

async function submitAccountForm(form) {
  if (!form.reportValidity()) return;
  const isRegister = form.id === 'register-form';
  const errorElement = form.querySelector('.form-error');
  if (errorElement) errorElement.textContent = '';
  const formData = new FormData(form);
  const payload = isRegister
    ? {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        department: String(formData.get('department') || '').trim(),
        password: String(formData.get('password') || ''),
        confirmPassword: String(formData.get('confirmPassword') || ''),
      }
    : {
        email: String(formData.get('email') || '').trim(),
        password: String(formData.get('password') || ''),
      };
  try {
    const result = await api(isRegister ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await activateUser(result.user, result.csrfToken);
    showToast(isRegister ? `Conta criada. Seu ID interno é ${result.user.id}.` : 'Acesso realizado.');
  } catch (error) {
    if (errorElement) errorElement.textContent = error.message;
    else showToast(error.message);
  }
}

async function reloadTicketDialog(id) {
  await reloadAdminData();
  render();
  const freshTrigger = [...app.querySelectorAll('[data-action="open-ticket"]')].find((button) => button.dataset.id === id);
  if (freshTrigger) lastTrigger = freshTrigger;
  else if (!lastTrigger || !document.contains(lastTrigger)) lastTrigger = document.querySelector('.nav-item[data-view="tickets"]');
  openTicket(id, lastTrigger, false);
  if (!notificationPanel.hidden) notificationPanel.innerHTML = renderNotifications(model.tickets);
}

function openTicket(id, trigger = null, moveFocus = true) {
  if (currentUser?.role !== 'admin') return;
  const ticket = model?.tickets.find((item) => item.id === id);
  if (!ticket) return;
  selectedTicketId = id;
  if (trigger) lastTrigger = trigger;
  ticketDialogContent.innerHTML = renderTicketDetails(ticket, model);
  if (!ticketDialog.open) ticketDialog.showModal();
  if (moveFocus) ticketDialog.querySelector('.dialog-close').focus();
}

async function handleAppClick(event) {
  const authTab = event.target.closest('[data-auth-view]');
  if (authTab) { switchAuthPanel(authTab.dataset.authView); return; }
  const viewButton = event.target.closest('[data-view]');
  if (viewButton && currentUser?.role === 'admin') {
    activeView = viewButton.dataset.view;
    render();
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  if (actionButton.dataset.action === 'new-ticket') {
    lastTrigger = actionButton;
    document.querySelector('#new-ticket-error').textContent = '';
    newTicketForm.reset();
    document.querySelector('#requester-name').value = currentUser.name || currentUser.email;
    newTicketForm.querySelector('[name="department"]').value = currentUser.department || '';
    populateTicketForm();
    if (categories.length) document.querySelector('#new-category').value = categories[0];
    newTicketDialog.showModal();
    document.querySelector('#requester-name').focus();
  } else if (actionButton.dataset.action === 'open-ticket') {
    openTicket(actionButton.dataset.id, actionButton);
  } else if (actionButton.dataset.action === 'delete-category' && currentUser?.role === 'admin') {
    if (model.categories.length <= 1) { showToast('Mantenha pelo menos uma categoria.'); return; }
    const category = actionButton.dataset.category;
    if (window.confirm(`Remover a categoria “${category}”?`)) {
      try {
        await api(`/api/admin/categories?name=${encodeURIComponent(category)}`, { method: 'DELETE' });
        await reloadAdminData(); render(); showToast('Categoria removida.');
      } catch (error) { showToast(error.message); }
    }
  }
}

async function handleChange(event) {
  if (event.target.dataset.sort === 'queue') { sortBy = event.target.value; render(); return; }
  if (event.target.dataset.filter) { filters[event.target.dataset.filter] = event.target.value; render(); return; }
  const ticket = model?.tickets.find((item) => item.id === selectedTicketId);
  if (!ticket || currentUser?.role !== 'admin') return;
  let patch = null;
  let message = '';
  if (event.target.id === 'ticket-status-select' && STATUS.includes(event.target.value) && ticket.status !== event.target.value) {
    patch = { status: event.target.value }; message = `Status de ${ticket.id} atualizado para ${event.target.value}.`;
  } else if (event.target.id === 'ticket-priority-select' && PRIORITIES.includes(event.target.value) && ticket.priority !== event.target.value) {
    patch = { priority: event.target.value }; message = `Prioridade de ${ticket.id} atualizada para ${event.target.value}.`;
  } else if (event.target.id === 'ticket-assignee-select' && String(ticket.assigneeId || '') !== event.target.value) {
    patch = { assigneeId: event.target.value || null }; message = 'Responsável atualizado.';
  }
  if (!patch) return;
  try {
    await api(`/api/tickets/${encodeURIComponent(ticket.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    await reloadTicketDialog(ticket.id);
    showToast(message);
  } catch (error) { showToast(error.message); }
}

async function handleSubmit(event) {
  const form = event.target;
  if (form.id === 'login-form' || form.id === 'register-form') {
    event.preventDefault();
    await submitAccountForm(form);
  } else if (form.id === 'password-form') {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const errorElement = document.querySelector('#password-error');
    errorElement.textContent = '';
    const data = new FormData(form);
    try {
      const result = await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: String(data.get('currentPassword') || ''),
          newPassword: String(data.get('newPassword') || ''),
          confirmPassword: String(data.get('confirmPassword') || ''),
        }),
      });
      setCsrfToken(result.csrfToken);
      passwordDialog.close();
      form.reset();
      showToast('Senha atualizada.');
    } catch (error) { errorElement.textContent = error.message; }
  } else if (form.id === 'comment-form') {
    event.preventDefault();
    const text = String(new FormData(form).get('comment') || '').trim();
    if (!selectedTicketId || !text) return;
    try {
      await api(`/api/tickets/${encodeURIComponent(selectedTicketId)}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
      await reloadTicketDialog(selectedTicketId);
      showToast('Comentário adicionado ao histórico.');
    } catch (error) { showToast(error.message); }
  } else if (form.id === 'category-form') {
    event.preventDefault();
    const category = String(new FormData(form).get('category') || '').trim();
    try {
      await api('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name: category }) });
      await reloadAdminData(); render(); showToast('Categoria adicionada.');
    } catch (error) { showToast(error.message); }
  } else if (form.id === 'settings-form') {
    event.preventDefault();
    const data = new FormData(form);
    const settings = {
      teams: String(data.get('teams') || '').split(',').map((value) => value.trim()).filter(Boolean),
      sla: Object.fromEntries(PRIORITIES.map((priority) => [priority, String(data.get(`sla-${priority}`) || '').trim()])),
    };
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) });
      await reloadAdminData(); render(); showToast('Configurações salvas no servidor.');
    } catch (error) { showToast(error.message); }
  } else if (form.id === 'admin-form') {
    event.preventDefault();
    const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
    try {
      const result = await api('/api/admin/admins', { method: 'POST', body: JSON.stringify({ email }) });
      await reloadAdminData(); render();
      showToast(result.message);
    } catch (error) { showToast(error.message); }
  }
}

async function createTicket(event) {
  event.preventDefault();
  if (!newTicketForm.reportValidity()) return;
  const formData = new FormData(newTicketForm);
  const error = document.querySelector('#new-ticket-error');
  error.textContent = '';
  const file = newTicketForm.querySelector('[name="attachment"]')?.files?.[0];
  const payload = {
    requesterName: String(formData.get('requesterName') || '').trim(),
    department: String(formData.get('department') || '').trim(),
    subject: String(formData.get('subject') || '').trim(),
    description: String(formData.get('description') || '').trim(),
    category: String(formData.get('category') || ''),
    priority: String(formData.get('priority') || 'Média'),
    attachmentName: file?.name || '',
  };
  try {
    const result = await api('/api/tickets', { method: 'POST', body: JSON.stringify(payload) });
    newTicketDialog.close();
    newTicketForm.reset();
    lastCreatedTicket = result.ticket.id;
    if (currentUser.role === 'admin') {
      await reloadAdminData();
      activeView = 'tickets';
      filters = { status: 'Todas', priority: 'Todas', category: 'Todas', assignee: 'Todas', period: 'Tudo' };
    }
    render();
    showToast(`${result.ticket.id} aberto e salvo no PostgreSQL.`);
  } catch (requestError) {
    error.textContent = requestError.message;
  }
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    location.replace('/');
  } catch (error) { showToast(error.message); }
}

function bindEvents() {
  document.querySelector('.primary-nav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button || currentUser?.role !== 'admin') return;
    activeView = button.dataset.view;
    render();
    document.querySelector('#conteudo').focus({ preventScroll: true });
  });
  searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLocaleLowerCase('pt-BR'); render(); });
  document.querySelector('#notification-button').addEventListener('click', (event) => {
    if (currentUser?.role !== 'admin') return;
    const opening = notificationPanel.hidden;
    notificationPanel.hidden = !opening;
    event.currentTarget.setAttribute('aria-expanded', String(opening));
    if (opening) notificationPanel.innerHTML = renderNotifications(model.tickets);
  });
  document.querySelector('#logout-button').addEventListener('click', logout);
  document.querySelector('#password-button').addEventListener('click', () => {
    passwordForm.reset();
    document.querySelector('#password-error').textContent = '';
    passwordDialog.showModal();
    passwordForm.querySelector('[name="currentPassword"]').focus();
  });
  document.addEventListener('click', (event) => {
    const notificationTicket = event.target.closest('#notification-panel [data-action="open-ticket"]');
    if (notificationTicket && currentUser?.role === 'admin') {
      notificationPanel.hidden = true;
      document.querySelector('#notification-button').setAttribute('aria-expanded', 'false');
      openTicket(notificationTicket.dataset.id, notificationTicket);
      return;
    }
    if (!notificationPanel.hidden && !event.target.closest('#notification-panel, #notification-button')) {
      notificationPanel.hidden = true;
      document.querySelector('#notification-button').setAttribute('aria-expanded', 'false');
    }
    const closeButton = event.target.closest('[data-close-dialog]');
    if (closeButton) document.getElementById(closeButton.dataset.closeDialog)?.close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && currentUser?.role === 'admin' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault(); searchInput.focus();
    }
  });
  app.addEventListener('click', (event) => { void handleAppClick(event); });
  app.addEventListener('change', (event) => { void handleChange(event); });
  app.addEventListener('submit', (event) => { void handleSubmit(event); });
  ticketDialog.addEventListener('change', (event) => { void handleChange(event); });
  ticketDialog.addEventListener('submit', (event) => { void handleSubmit(event); });
  passwordForm.addEventListener('submit', (event) => { void handleSubmit(event); });
  newTicketForm.addEventListener('submit', (event) => { void createTicket(event); });
  ticketDialog.addEventListener('click', (event) => { if (event.target === ticketDialog) ticketDialog.close(); });
  newTicketDialog.addEventListener('click', (event) => { if (event.target === newTicketDialog) newTicketDialog.close(); });
  passwordDialog.addEventListener('click', (event) => { if (event.target === passwordDialog) passwordDialog.close(); });
  ticketDialog.addEventListener('close', () => { if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus(); });
  newTicketDialog.addEventListener('close', () => { if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus(); });
}

async function start() {
  bindEvents();
  try {
    const session = await getSession();
    setCsrfToken(session.csrfToken);
    currentUser = session.user;
    if (!currentUser) return renderAnonymous();
    categories = (await api('/api/categories')).categories;
    if (currentUser.role === 'admin') {
      activeView = 'overview';
      await reloadAdminData();
    } else {
      activeView = 'requester';
    }
    render();
  } catch (error) {
    document.body.dataset.role = 'anonymous';
    document.querySelector('#topbar').hidden = true;
    app.innerHTML = `<section class="auth-page"><div class="auth-card"><p class="eyebrow">CENTRAL DE ATENDIMENTO</p><h1>Não foi possível conectar</h1><p class="auth-intro">${escapeHTML(error.message)} Confira se PostgreSQL e o servidor Node estão ativos.</p><button class="button button-primary auth-button" type="button" id="retry-button">Tentar novamente</button></div></section>`;
    app.setAttribute('aria-busy', 'false');
    document.querySelector('#retry-button').addEventListener('click', () => location.reload());
    console.error(error);
  }
}

start();
