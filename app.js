'use strict';

const RETENTION_DAYS = 90; // fallback only — the server enforces the retention window
const TOKEN_KEY = 'timesheet.token.v1';

const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#entry-form'),
  date: $('#entry-date'),
  taskSelect: $('#task-select'),
  newTaskInput: $('#new-task-input'),
  description: $('#description'),
  hours: $('#hours'),
  saveBtn: $('#save-entry'),
  formError: $('#form-error'),
  taskForm: $('#task-form'),
  taskInput: $('#task-name-input'),
  taskAddBtn: $('#task-add-btn'),
  taskList: $('#task-list'),
  entryList: $('#entry-list'),
  entriesCount: $('#entries-count'),
  totalHours: $('#total-hours'),
  downloadCsv: $('#download-csv'),
  downloadJson: $('#download-json'),
  banner: $('#banner'),
  logoutBtn: $('#logout-btn'),
  loginOverlay: $('#login-overlay'),
  loginForm: $('#login-form'),
  loginPassword: $('#login-password'),
  loginSubmitBtn: $('#login-submit-btn'),
  loginError: $('#login-error'),
  appContent: $('#app-content'),
  themeToggle: $('#theme-toggle'),
};

const THEME_KEY = 'timesheet.theme.v1';

let tasks = [];
let entries = [];
let bannerTimer;

/* ---------- API ---------- */

async function api(path, options = {}) {
  const headers = {
    'content-type': 'application/json',
  };

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    headers,
    ...options,
  });

  if (res.status === 401) {
    // Session expired or invalid token
    localStorage.removeItem(TOKEN_KEY);
    showLoginOverlay();
    throw new Error('Session expired. Please log in again.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (HTTP ${res.status})`);
  }

  return data;
}

async function loadEntries() {
  const data = await api('/api/entries');
  entries = data.entries;
  if (data.cutoff) els.date.min = data.cutoff;
}

async function loadTasks() {
  tasks = (await api('/api/tasks')).tasks;
}

async function saveEntry(entry) {
  const data = await api('/api/entries', { method: 'POST', body: JSON.stringify(entry) });
  entries.push(data.entry);
}

async function deleteEntry(id) {
  await api(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
  entries = entries.filter((e) => e.id !== id);
}

async function addTask(name) {
  await api('/api/tasks', { method: 'POST', body: JSON.stringify({ name }) });
  tasks = (await api('/api/tasks')).tasks;
}

async function removeTask(name) {
  await api(`/api/tasks?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
  tasks = tasks.filter((t) => t !== name);
}

function showBanner(message) {
  els.banner.textContent = message;
  els.banner.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    els.banner.hidden = true;
  }, 8000);
}

/* ---------- Authentication UI ---------- */

function showLoginOverlay() {
  els.loginOverlay.hidden = false;
  els.appContent.style.opacity = '0.15';
  els.appContent.style.pointerEvents = 'none';
  els.logoutBtn.classList.add('hidden');
  els.loginPassword.value = '';
  els.loginPassword.focus();
}

function hideLoginOverlay() {
  els.loginOverlay.hidden = true;
  els.appContent.style.opacity = '';
  els.appContent.style.pointerEvents = '';
  els.logoutBtn.classList.remove('hidden');
  els.loginError.hidden = true;
}

async function handleLogin(ev) {
  ev.preventDefault();
  els.loginError.hidden = true;
  const password = els.loginPassword.value;
  if (!password) return;

  els.loginSubmitBtn.disabled = true;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });

    localStorage.setItem(TOKEN_KEY, data.token);
    hideLoginOverlay();
    await loadAppData();
  } catch (err) {
    els.loginError.textContent = err.message;
    els.loginError.hidden = false;
    els.loginPassword.focus();
  } finally {
    els.loginSubmitBtn.disabled = false;
  }
}

function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  entries = [];
  tasks = [];
  renderTasks();
  renderTaskSelect();
  renderEntries();
  showLoginOverlay();
}

/* ---------- Dates ---------- */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayISO() {
  return toISODate(new Date());
}

function cutoffISO() {
  const d = new Date();
  d.setDate(d.getDate() - RETENTION_DAYS);
  return toISODate(d);
}

function formatDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return iso === todayISO() ? `Today · ${label}` : label;
}

/* ---------- Small DOM helpers ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatHours(n) {
  return (Math.round(n * 100) / 100).toString();
}

function showError(msg) {
  els.formError.textContent = msg;
  els.formError.hidden = false;
}

function clearError() {
  els.formError.textContent = '';
  els.formError.hidden = true;
}

/* ---------- Configured tasks ---------- */

function renderTasks() {
  els.taskList.textContent = '';
  if (!tasks.length) {
    els.taskList.appendChild(
      el('li', 'empty-note', 'No configured tasks yet. Add one above, or pick “New task…” when logging an entry.')
    );
    return;
  }
  for (const name of tasks) {
    const chip = el('li', 'task-chip');
    chip.appendChild(el('span', null, name));
    const remove = el('button', 'btn-icon task-remove', '×');
    remove.type = 'button';
    remove.title = `Remove task "${name}"`;
    remove.setAttribute('aria-label', `Remove task ${name}`);
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        await removeTask(name);
        renderTasks();
        renderTaskSelect();
      } catch (err) {
        showBanner(`Couldn't remove task: ${err.message}`);
      } finally {
        remove.disabled = false;
      }
    });
    chip.appendChild(remove);
    els.taskList.appendChild(chip);
  }
}

function renderTaskSelect() {
  const previous = els.taskSelect.value;
  els.taskSelect.textContent = '';
  const placeholder = new Option('Select a task…', '');
  placeholder.disabled = true;
  els.taskSelect.add(placeholder);
  for (const name of tasks) els.taskSelect.add(new Option(name, name));
  els.taskSelect.add(new Option('＋ New task…', '__new__'));

  if (previous && [...els.taskSelect.options].some((o) => o.value === previous)) {
    els.taskSelect.value = previous;
  } else {
    els.taskSelect.selectedIndex = 0;
  }
  toggleNewTaskInput();
}

async function handleTaskAdd(ev) {
  ev.preventDefault();
  const name = els.taskInput.value.trim();
  if (!name) return;
  els.taskAddBtn.disabled = true;
  try {
    await addTask(name);
    els.taskInput.value = '';
    renderTasks();
    renderTaskSelect();
  } catch (err) {
    showBanner(`Couldn't add task: ${err.message}`);
  } finally {
    els.taskAddBtn.disabled = false;
  }
}

function toggleNewTaskInput() {
  const isNew = els.taskSelect.value === '__new__';
  els.newTaskInput.classList.toggle('hidden', !isNew);
  if (isNew) els.newTaskInput.focus();
}

/* ---------- Entries ---------- */

function sortedEntries() {
  return [...entries].sort((a, b) =>
    a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : a.date < b.date ? 1 : -1
  );
}

function renderEntries() {
  els.entryList.textContent = '';
  els.entriesCount.textContent = String(entries.length);

  const total = entries.reduce((sum, e) => sum + e.hours, 0);
  els.totalHours.textContent = entries.length ? `${formatHours(total)} h total` : '';
  els.downloadCsv.disabled = els.downloadJson.disabled = !entries.length;

  if (!entries.length) {
    els.entryList.appendChild(el('p', 'empty-note', 'No entries yet. Log your first one above — it will appear here.'));
    return;
  }

  const groups = new Map();
  for (const e of sortedEntries()) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }

  for (const [date, items] of groups) {
    const day = el('div', 'day');
    const head = el('div', 'day-head');
    head.appendChild(el('h3', null, formatDateLabel(date)));
    head.appendChild(el('span', 'day-total', `${formatHours(items.reduce((s, e) => s + e.hours, 0))} h`));
    day.appendChild(head);
    for (const item of items) day.appendChild(entryRow(item));
    els.entryList.appendChild(day);
  }
}

function entryRow(item) {
  const row = el('div', 'entry');
  row.appendChild(el('span', 'entry-task', item.task));
  row.appendChild(el('span', 'entry-hours', `${formatHours(item.hours)} h`));

  const remove = el('button', 'btn-icon entry-remove', '×');
  remove.type = 'button';
  remove.title = 'Delete entry';
  remove.setAttribute('aria-label', `Delete ${item.task} entry on ${item.date}`);
  remove.addEventListener('click', async () => {
    remove.disabled = true;
    try {
      await deleteEntry(item.id);
      renderEntries();
    } catch (err) {
      showBanner(`Couldn't delete entry: ${err.message}`);
    } finally {
      remove.disabled = false;
    }
  });
  row.appendChild(remove);

  row.appendChild(el('span', 'entry-desc', item.description || '—'));
  return row;
}

async function handleSave(ev) {
  ev.preventDefault();
  clearError();

  const date = els.date.value;
  if (!date) return showError('Please pick a date.');

  let task = '';
  if (els.taskSelect.value === '__new__') task = els.newTaskInput.value.trim();
  else if (els.taskSelect.value) task = els.taskSelect.value;
  if (!task) return showError('Choose a task, or pick “New task…” and give it a name.');

  const hours = Number(els.hours.value);
  if (!Number.isFinite(hours) || hours <= 0) return showError('Enter how many hours you worked (more than 0).');
  if (hours > 24) return showError("A single entry can't be more than 24 hours.");

  const description = els.description.value.trim();
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `e-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  els.saveBtn.disabled = true;
  try {
    if (!tasks.some((t) => t.toLowerCase() === task.toLowerCase())) {
      try {
        await addTask(task); // make it a configured task for next time
      } catch {
        /* non-fatal: the entry itself still gets saved */
      }
    }
    await saveEntry({ id, date, task, description, hours, createdAt: new Date().toISOString() });
    renderTasks();
    renderTaskSelect();
    renderEntries();

    // Reset the transient fields, keep date + task for rapid consecutive logging.
    els.description.value = '';
    els.hours.value = '';
    els.newTaskInput.value = '';
    els.newTaskInput.classList.add('hidden');
    if ([...els.taskSelect.options].some((o) => o.value === task)) els.taskSelect.value = task;
    els.hours.focus();
  } catch (err) {
    showError(`Couldn't save entry: ${err.message}`);
  } finally {
    els.saveBtn.disabled = false;
  }
}

/* ---------- Downloads ---------- */

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv() {
  const rows = [['Date', 'Task', 'Description', 'Hours']];
  for (const e of sortedEntries()) rows.push([e.date, e.task, e.description, String(e.hours)]);
  const csv = '\ufeff' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  downloadBlob(csv, `timesheet-${todayISO()}.csv`, 'text/csv;charset=utf-8');
}

function exportJson() {
  const payload = { exportedAt: new Date().toISOString(), entries: sortedEntries() };
  downloadBlob(JSON.stringify(payload, null, 2), `timesheet-${todayISO()}.json`, 'application/json');
}

/* ---------- App Loader ---------- */

async function loadAppData() {
  try {
    await loadEntries();
  } catch (err) {
    showBanner(`Couldn't load entries: ${err.message}`);
  }
  try {
    await loadTasks();
  } catch (err) {
    showBanner(`Couldn't load tasks: ${err.message}`);
  }

  renderTasks();
  renderTaskSelect();
  renderEntries();
}

/** ---------- Theme Toggle ---------- */

function getPreferredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function handleThemeToggle() {
  const current = document.documentElement.getAttribute('data-theme');
  const isDark = current === 'dark' || (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(isDark ? 'light' : 'dark');
}

/* ---------- Init ---------- */

async function init() {
  els.date.value = todayISO();
  els.date.max = todayISO();
  els.date.min = cutoffISO(); // fallback

  els.form.addEventListener('submit', handleSave);
  els.taskSelect.addEventListener('change', toggleNewTaskInput);
  els.taskForm.addEventListener('submit', handleTaskAdd);
  els.downloadCsv.addEventListener('click', exportCsv);
  els.downloadJson.addEventListener('click', exportJson);

  // Theme toggle listener
  els.themeToggle.addEventListener('click', handleThemeToggle);

  // Authentication listeners
  els.loginForm.addEventListener('submit', handleLogin);
  els.logoutBtn.addEventListener('click', handleLogout);

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    showLoginOverlay();
  } else {
    hideLoginOverlay();
    await loadAppData();
  }

  // Apply saved theme or system preference
  applyTheme(getPreferredTheme());
}

init();
