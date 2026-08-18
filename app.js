'use strict';

const RETENTION_DAYS = 90; // fallback only — the server enforces the retention window
const TOKEN_KEY = 'timesheet.token.v1';

const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#entry-form'),
  formHeading: $('#form-heading'),
  date: $('#entry-date'),
  entryTaskInput: $('#entry-task-input'),
  entryTaskSuggestions: $('#entry-task-suggestions'),
  description: $('#description'),
  descriptionSuggestions: $('#description-suggestions'),
  hoursPart: $('#hours-part'),
  minutesPart: $('#minutes-part'),
  saveBtn: $('#save-entry'),
  cancelEditBtn: $('#cancel-edit'),
  formError: $('#form-error'),
  taskForm: $('#task-form'),
  newTaskNameInput: $('#new-task-name-input'),
  taskAddBtn: $('#task-add-btn'),
  taskList: $('#task-list'),
  entryList: $('#entry-list'),
  entriesCount: $('#entries-count'),
  totalHours: $('#total-hours'),
  downloadCsv: $('#download-csv'),
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
let editingEntryId = null;

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

  if (res.status === 401 && path !== '/api/login') {
    // Session expired or invalid token (on routes other than login itself)
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

async function updateEntry(id, fields) {
  await api(`/api/entries/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(fields) });
  const idx = entries.findIndex((e) => e.id === id);
  if (idx !== -1) entries[idx] = { ...entries[idx], ...fields };
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
  cancelEdit();
  renderTasks();
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

function formatDuration(hoursDecimal) {
  const totalMinutes = Math.round(hoursDecimal * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

function setDurationInputs(hoursDecimal) {
  const totalMinutes = Math.round(hoursDecimal * 60);
  els.hoursPart.value = Math.floor(totalMinutes / 60);
  els.minutesPart.value = totalMinutes % 60;
}

function clearDurationInputs() {
  els.hoursPart.value = '';
  els.minutesPart.value = '';
}

function getDurationHours() {
  const h = els.hoursPart.value.trim() === '' ? NaN : Number(els.hoursPart.value);
  const m = els.minutesPart.value.trim() === '' ? 0 : Number(els.minutesPart.value);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || m > 59) return NaN;
  return h + m / 60;
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

async function handleTaskAdd(ev) {
  ev.preventDefault();
  const name = els.newTaskNameInput.value.trim();
  if (!name) return;
  els.taskAddBtn.disabled = true;
  try {
    await addTask(name);
    els.newTaskNameInput.value = '';
    renderTasks();
  } catch (err) {
    showBanner(`Couldn't add task: ${err.message}`);
  } finally {
    els.taskAddBtn.disabled = false;
  }
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
  els.totalHours.textContent = entries.length ? `${formatDuration(total)} total` : '';
  els.downloadCsv.disabled = !entries.length;

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
    head.appendChild(el('span', 'day-total', formatDuration(items.reduce((s, e) => s + e.hours, 0))));
    day.appendChild(head);
    for (const item of items) day.appendChild(entryRow(item));
    els.entryList.appendChild(day);
  }
}

function entryRow(item) {
  const row = el('div', 'entry');
  row.appendChild(el('span', 'entry-task', item.task));
  row.appendChild(el('span', 'entry-hours', formatDuration(item.hours)));

  const edit = el('button', 'btn-icon entry-edit', '✎');
  edit.type = 'button';
  edit.title = 'Edit entry';
  edit.setAttribute('aria-label', `Edit ${item.task} entry on ${item.date}`);
  edit.addEventListener('click', () => startEdit(item));
  row.appendChild(edit);

  const remove = el('button', 'btn-icon entry-remove', '×');
  remove.type = 'button';
  remove.title = 'Delete entry';
  remove.setAttribute('aria-label', `Delete ${item.task} entry on ${item.date}`);
  remove.addEventListener('click', async () => {
    remove.disabled = true;
    try {
      await deleteEntry(item.id);
      if (editingEntryId === item.id) cancelEdit();
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

  const task = els.entryTaskInput.value.trim();
  if (!task) return showError('Enter or select a task.');

  const hours = getDurationHours();
  if (!Number.isFinite(hours) || hours <= 0) return showError('Enter how much time you worked (hours and/or minutes).');
  if (hours > 24) return showError("A single entry can't be more than 24 hours.");

  const description = els.description.value.trim();

  els.saveBtn.disabled = true;
  try {
    if (!tasks.some((t) => t.toLowerCase() === task.toLowerCase())) {
      try {
        await addTask(task); // make it a configured task for next time
      } catch {
        /* non-fatal: the entry itself still gets saved */
      }
    }

    if (editingEntryId) {
      await updateEntry(editingEntryId, { date, task, description, hours });
      finishEdit();
    } else {
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await saveEntry({ id, date, task, description, hours, createdAt: new Date().toISOString() });
    }

    renderTasks();
    renderEntries();

    // Reset the transient fields, keep date + task for rapid consecutive logging.
    els.description.value = '';
    clearDurationInputs();
    els.hoursPart.focus();
  } catch (err) {
    showError(`Couldn't save entry: ${err.message}`);
  } finally {
    els.saveBtn.disabled = false;
  }
}

function startEdit(item) {
  editingEntryId = item.id;
  els.date.value = item.date;
  els.entryTaskInput.value = item.task;
  els.description.value = item.description || '';
  setDurationInputs(item.hours);
  els.saveBtn.textContent = 'Update entry';
  els.cancelEditBtn.classList.remove('hidden');
  if (els.formHeading) els.formHeading.textContent = 'Edit entry';
  clearError();
  els.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  els.entryTaskInput.focus();
}

function finishEdit() {
  editingEntryId = null;
  els.saveBtn.textContent = 'Save entry';
  els.cancelEditBtn.classList.add('hidden');
  if (els.formHeading) els.formHeading.textContent = 'New entry';
}

function cancelEdit() {
  finishEdit();
  els.date.value = todayISO();
  els.entryTaskInput.value = '';
  els.description.value = '';
  clearDurationInputs();
  clearError();
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
  renderEntries();
}

/* ---------- Autocomplete ---------- */

function highlightMatch(label, query) {
  const q = query.trim();
  if (!q) return document.createTextNode(label);
  const idx = label.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return document.createTextNode(label);

  const frag = document.createDocumentFragment();
  const before = label.slice(0, idx);
  const match = label.slice(idx, idx + q.length);
  const after = label.slice(idx + q.length);
  if (before) frag.appendChild(document.createTextNode(before));
  frag.appendChild(el('mark', null, match));
  if (after) frag.appendChild(document.createTextNode(after));
  return frag;
}

function createAutocomplete({ input, list, getSuggestions }) {
  let items = [];
  let activeIndex = -1;

  function render() {
    list.textContent = '';
    if (!items.length) {
      list.classList.add('hidden');
      activeIndex = -1;
      return;
    }
    items.forEach((item, i) => {
      const li = el('li', 'autocomplete-item' + (i === activeIndex ? ' active' : ''));
      li.appendChild(highlightMatch(item.label, input.value));
      if (item.meta) li.appendChild(el('span', 'ac-meta', item.meta));
      li.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); // keep focus on the input so blur doesn't fire first
        select(item.value);
      });
      list.appendChild(li);
    });
    list.classList.remove('hidden');
  }

  function select(value) {
    input.value = value;
    close();
    input.dispatchEvent(new Event('change'));
    input.focus();
  }

  function close() {
    items = [];
    activeIndex = -1;
    list.textContent = '';
    list.classList.add('hidden');
  }

  function update() {
    items = getSuggestions(input.value).slice(0, 8);
    activeIndex = items.length ? 0 : -1;
    render();
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('keydown', (ev) => {
    if (list.classList.contains('hidden') || !items.length) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      render();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      render();
    } else if (ev.key === 'Enter') {
      if (activeIndex >= 0) {
        ev.preventDefault();
        select(items[activeIndex].value);
      }
    } else if (ev.key === 'Escape') {
      close();
    }
  });
  input.addEventListener('blur', close);

  return { close };
}

function getTaskSuggestions(query) {
  const q = query.trim().toLowerCase();
  const matches = q ? tasks.filter((t) => t.toLowerCase().includes(q)) : tasks.slice();
  return matches
    .filter((t) => t.toLowerCase() !== q)
    .map((t) => ({ value: t, label: t }));
}

function getDescriptionSuggestions(query) {
  const q = query.trim().toLowerCase();
  const currentTask = els.entryTaskInput.value.trim().toLowerCase();

  const sameTask = new Map();
  const otherTask = new Map();
  for (const e of entries) {
    if (!e.description) continue;
    const bucket = currentTask && e.task.toLowerCase() === currentTask ? sameTask : otherTask;
    bucket.set(e.description, (bucket.get(e.description) || 0) + 1);
  }

  const rank = (map) =>
    [...map.entries()]
      .filter(([desc]) => !q || desc.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1])
      .map(([desc]) => desc);

  const seen = new Set();
  const suggestions = [];
  for (const desc of [...rank(sameTask), ...rank(otherTask)]) {
    if (seen.has(desc) || desc.toLowerCase() === q) continue;
    seen.add(desc);
    suggestions.push({ value: desc, label: desc, meta: currentTask && sameTask.has(desc) ? 'Used for this task' : 'Previously used' });
  }
  return suggestions;
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
  els.cancelEditBtn.addEventListener('click', cancelEdit);
  els.taskForm.addEventListener('submit', handleTaskAdd);
  els.downloadCsv.addEventListener('click', exportCsv);

  // Intelligent autocomplete for the task and description fields
  createAutocomplete({
    input: els.entryTaskInput,
    list: els.entryTaskSuggestions,
    getSuggestions: getTaskSuggestions,
  });
  createAutocomplete({
    input: els.description,
    list: els.descriptionSuggestions,
    getSuggestions: getDescriptionSuggestions,
  });

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
