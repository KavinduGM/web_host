async function request(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(body?.error || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  me: () => request('/auth/me'),
  login: (password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  listDemos: () => request('/demos'),
  getDemo: (id) => request(`/demos/${id}`),
  createDemo: (data) => request('/demos', { method: 'POST', body: JSON.stringify(data) }),
  updateDemo: (id, data) => request(`/demos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDemo: (id) => request(`/demos/${id}`, { method: 'DELETE' }),
  rebuild: (id) => request(`/demos/${id}/rebuild`, { method: 'POST' }),
  enable: (id) => request(`/demos/${id}/enable`, { method: 'POST' }),
  disable: (id) => request(`/demos/${id}/disable`, { method: 'POST' }),
  getBuildLog: (demoId, buildId) => request(`/demos/${demoId}/builds/${buildId}`),
};
