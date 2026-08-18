export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function rowToEntry(row) {
  return {
    id: row.id,
    date: row.date,
    task: row.task,
    description: row.description,
    hours: row.hours,
    createdAt: row.created_at,
  };
}

export function normalizeEntry(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid entry body' };

  const date = typeof body.date === 'string' ? body.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date must be in YYYY-MM-DD format' };

  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) return { error: 'Task is required' };
  if (task.length > 200) return { error: 'Task name is too long' };

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > 2000) return { error: 'Description is too long' };

  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { error: 'Hours must be greater than 0 and at most 24' };
  }

  const id = typeof body.id === 'string' && body.id ? body.id : crypto.randomUUID();
  const createdAt =
    typeof body.createdAt === 'string' && body.createdAt
      ? body.createdAt
      : new Date().toISOString();

  return { entry: { id, date, task, description, hours, createdAt } };
}
