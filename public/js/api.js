'use strict';

/* Thin client for the Express API. Every write returns the full state. */
const api = {
  async call(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Server returned ${res.status}`);
    }
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  state: () => api.call('GET', '/api/state'),
  addRequest: (b) => api.call('POST', '/api/requests', b),
  updateRequest: (id, b) => api.call('PUT', `/api/requests/${encodeURIComponent(id)}`, b),
  deleteRequest: (id) => api.call('DELETE', `/api/requests/${encodeURIComponent(id)}`),
  addItem: (b) => api.call('POST', '/api/items', b),
  restock: (id, q) => api.call('POST', `/api/items/${encodeURIComponent(id)}/restock`, { quantity: q }),
  lookup: (k) => api.call('GET', `/api/lookup/${encodeURIComponent(k)}`),
  step: () => api.call('POST', '/api/allocate/step'),
  runAll: () => api.call('POST', '/api/allocate/run'),
  rebuild: () => api.call('POST', '/api/allocate/reset'),
  route: (t) => api.call('GET', `/api/route/${encodeURIComponent(t)}`),
  toggleRoad: (id) => api.call('POST', `/api/roads/${encodeURIComponent(id)}/toggle`),
  dispatch: (id) => api.call('POST', `/api/allocations/${id}/dispatch`),
  receive: (id, q) => api.call('POST', `/api/allocations/${id}/receive`, { received: q }),
  reset: () => api.call('POST', '/api/reset'),
  reconnect: () => api.call('POST', '/api/db/reconnect'),
};
