'use strict';

let S = null; // server state
const U = {
  view: 'overview',
  reqFilter: 'open',
  editing: null,
  hashMap: 'requests',
  lookup: null,
  lastStep: null,
  delFilter: 'active',
  logFilter: '',
  selectedAlloc: null,
  route: null,
  animating: false,
  animStep: 0,
  flash: new Set(),
};
let animTimer = null;

/* ---------- rendering ---------- */

function render() {
  if (!S) return;
  const chip = $('#dbChip');
  chip.classList.toggle('on', S.db.connected);
  chip.classList.toggle('off', !S.db.connected);
  $('#dbText').textContent = S.db.connected ? `MySQL · ${S.db.database}` : 'MySQL offline · in-memory';
  chip.title = S.db.connected
    ? `Connected to ${S.db.database} on ${S.db.host}. Every change is written to MySQL.`
    : `Not connected${S.db.error ? `: ${S.db.error}` : ''}. Click to retry the connection.`;

  const fn = { overview: Views.overview, requests: Views.requests, allocation: Views.allocation, routes: Views.routes, log: Views.log }[U.view];
  fn(S, U);
  U.flash.clear();
}

function show(view) {
  if (!document.getElementById(`view-${view}`)) view = 'overview';
  U.view = view;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  render();
  window.scrollTo(0, 0);
}

async function act(promise, okMsg) {
  try {
    const data = await promise;
    S = data.state;
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(data.result) : okMsg);
    render();
    return data.result;
  } catch (err) {
    toast(err.message, true);
    return undefined;
  }
}

/* ---------- Module 1 ---------- */

function nextRequestId() {
  const max = S.requests.reduce((m, r) => Math.max(m, Number(r.request_id.slice(2)) || 0), 100);
  return `R-${max + 1}`;
}

function resetReqForm() {
  const f = $('#reqForm');
  U.editing = null;
  f.reset();
  f.request_id.value = nextRequestId();
  f.requested_at.value = localInputNow();
  ['request_id', 'area_id', 'item_id', 'requested_at'].forEach((n) => { f[n].disabled = false; });
  $('#reqFormTitle').textContent = 'New request';
  $('#reqSubmit').textContent = 'Save request';
  $('#reqDelete').classList.add('hidden');
  $('#reqCancelEdit').classList.add('hidden');
}

function editRequest(id) {
  const r = S.requests.find((x) => x.request_id === id);
  if (!r) return;
  const f = $('#reqForm');
  U.editing = id;
  f.request_id.value = r.request_id;
  f.area_id.value = r.area_id;
  f.item_id.value = r.item_id;
  f.quantity.value = r.quantity;
  f.requested_at.value = r.requested_at.slice(0, 16).replace(' ', 'T');
  $$('input[name=urgency]', f).forEach((i) => { i.checked = Number(i.value) === r.urgency; });
  ['request_id', 'area_id', 'item_id', 'requested_at'].forEach((n) => { f[n].disabled = true; });
  $('#reqFormTitle').textContent = `Update ${id}`;
  $('#reqSubmit').textContent = 'Save changes';
  $('#reqDelete').classList.toggle('hidden', S.allocations.some((a) => a.request_id === id));
  $('#reqCancelEdit').classList.remove('hidden');
  render();
}

function bindRequests() {
  $('#reqForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const urgency = Number($('input[name=urgency]:checked', f).value);
    if (U.editing) {
      const id = U.editing;
      const ok = await act(api.updateRequest(id, { quantity: Number(f.quantity.value), urgency }), `${id} updated`);
      if (ok) { U.flash.add(id); resetReqForm(); render(); }
    } else {
      const body = {
        request_id: f.request_id.value, area_id: f.area_id.value, item_id: f.item_id.value,
        quantity: Number(f.quantity.value), urgency, requested_at: f.requested_at.value,
      };
      const rec = await act(api.addRequest(body), (r) => `${r.request_id} saved`);
      if (rec) { U.flash.add(rec.request_id); resetReqForm(); render(); }
    }
  });
  $('#reqCancelEdit').addEventListener('click', () => { resetReqForm(); render(); });
  $('#reqDelete').addEventListener('click', async () => {
    const id = U.editing;
    if (!id || !confirm(`Withdraw request ${id}? It will be removed from the database.`)) return;
    await act(api.deleteRequest(id), `${id} withdrawn`);
    resetReqForm();
    render();
  });
  $('#reqTable').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-req]');
    if (tr) editRequest(tr.dataset.req);
  });
  $('#reqFilters').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    U.reqFilter = b.dataset.f;
    $$('#reqFilters button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });

  $('#invTable').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target.closest('form[data-item]');
    const id = form.dataset.item;
    const q = Number(form.querySelector('input').value);
    const item = await act(api.restock(id, q), (i) => `${q} ${i.unit} added to ${i.name.toLowerCase()}`);
    if (item) { U.flash.add(id); render(); }
  });

  $('#itemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const item = await act(api.addItem({ item_id: f.item_id.value, name: f.name.value, unit: f.unit.value, on_hand: Number(f.on_hand.value) }),
      (i) => `${i.name} added`);
    if (item) { f.reset(); U.flash.add(item.item_id); render(); }
  });

  $('#hashFilters').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    U.hashMap = b.dataset.m;
    $$('#hashFilters button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  $('#lookupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { result } = await api.lookup(e.target.key.value);
      U.lookup = result;
      U.hashMap = result.kind === 'request' ? 'requests' : 'items';
      $$('#hashFilters button').forEach((x) => x.classList.toggle('on', x.dataset.m === U.hashMap));
      $('#lookupOut').classList.remove('muted');
      $('#lookupOut').innerHTML = Views.lookupText(result);
      render();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

/* ---------- Module 2 ---------- */

function bindAllocation() {
  $('#stepBtn').addEventListener('click', async () => {
    const r = await act(api.step());
    if (r) { U.lastStep = r; render(); }
  });
  $('#runBtn').addEventListener('click', async () => {
    const r = await act(api.runAll(), (x) => `${x.steps.length} request${x.steps.length === 1 ? '' : 's'} processed`);
    if (r && r.steps.length) { U.lastStep = r.steps[r.steps.length - 1]; render(); }
  });
  $('#rebuildBtn').addEventListener('click', async () => {
    U.lastStep = null;
    await act(api.rebuild(), 'Queue rebuilt from requests with a pending quantity');
  });
}

/* ---------- Module 3 ---------- */

function stopAnim() {
  clearInterval(animTimer);
  animTimer = null;
  U.animating = false;
}

async function planRoute() {
  const id = Number($('#allocSelect').value);
  const a = S.allocations.find((x) => x.allocation_id === id);
  if (!a) return;
  stopAnim();
  try {
    const { result } = await api.route(a.area_id);
    U.route = { ...result, forAlloc: id };
    if ($('#animate').checked && result.steps.length > 1) {
      U.animating = true;
      U.animStep = 0;
      render();
      animTimer = setInterval(() => {
        if (U.animStep >= U.route.steps.length - 1) {
          stopAnim();
        } else {
          U.animStep++;
        }
        if (U.view === 'routes') render();
      }, 700);
    } else {
      render();
    }
  } catch (err) {
    toast(err.message, true);
  }
}

function bindRoutes() {
  $('#allocSelect').addEventListener('change', (e) => {
    U.selectedAlloc = Number(e.target.value) || null;
    stopAnim();
    U.route = null;
    render();
  });
  $('#routeBtn').addEventListener('click', planRoute);
  $('#dispatchBtn').addEventListener('click', async () => {
    const id = U.selectedAlloc;
    const r = await act(api.dispatch(id), (x) => `Allocation #${x.allocation.allocation_id} dispatched, ${x.route.distance} min`);
    if (r) { U.route = null; render(); }
  });
  $('#graph').addEventListener('click', async (e) => {
    const g = e.target.closest('[data-road]');
    if (!g || U.animating) return;
    const r = await act(api.toggleRoad(g.dataset.road), (x) => `Road ${x.road_id} ${x.status}`);
    if (r) { U.route = null; render(); }
  });
  $('#delTable').addEventListener('click', (e) => {
    const b = e.target.closest('[data-plan]');
    if (!b) return;
    U.selectedAlloc = Number(b.dataset.plan);
    U.route = null;
    render();
    $('#allocSelect').value = b.dataset.plan;
    planRoute();
    $('#view-routes .page-head').scrollIntoView({ behavior: 'smooth' });
  });
  $('#delTable').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.closest('form[data-recv]');
    const q = Number(f.querySelector('input').value);
    await act(api.receive(f.dataset.recv, q), (a) => (a.received_qty < a.quantity
      ? `Receipt recorded. ${a.quantity - a.received_qty} carried forward on ${a.request_id}`
      : `Receipt recorded for ${a.request_id}`));
  });
  $('#delFilters').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    U.delFilter = b.dataset.f;
    $$('#delFilters button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
}

/* ---------- system ---------- */

function bindSystem() {
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  $('#logFilters').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    U.logFilter = b.dataset.f;
    $$('#logFilters button').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  $('#resetBtn').addEventListener('click', async () => {
    if (!confirm('Reset the simulation? All requests, allocations and log entries return to the starting scenario.')) return;
    stopAnim();
    Object.assign(U, { lastStep: null, route: null, lookup: null, selectedAlloc: null });
    $('#lookupOut').classList.add('muted');
    $('#lookupOut').textContent = 'Enter a request ID or item ID to see how the key is hashed to a bucket.';
    await act(api.reset(), 'Scenario reset');
    resetReqForm();
    render();
  });
  $('#dbChip').addEventListener('click', async () => {
    if (S && S.db.connected) return;
    const r = await act(api.reconnect());
    if (r) toast(r.connected ? 'Connected to MySQL' : `Still offline: ${r.error}`, !r.connected);
  });
  const tick = () => {
    $('#clock').textContent = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  tick();
  setInterval(tick, 15000);
}

(async function start() {
  bindRequests();
  bindAllocation();
  bindRoutes();
  bindSystem();
  try {
    S = (await api.state()).state;
  } catch (err) {
    toast(`Cannot reach the server: ${err.message}`, true);
    return;
  }
  resetReqForm();
  show(location.hash.slice(1) || 'overview');

  // Several people can use the same site: pick up their changes every few seconds.
  // Skipped while the user is typing or a route search is animating.
  setInterval(async () => {
    if (document.hidden || U.animating) return;
    const el = document.activeElement;
    if (el && /INPUT|SELECT|TEXTAREA/.test(el.tagName)) return;
    try {
      const next = (await api.state()).state;
      const sig = (st) => `${st.log.length}|${st.log[0] && st.log[0].event_id}|${st.log[0] && st.log[0].logged_at}|${st.db.connected}`;
      if (sig(next) !== sig(S)) {
        S = next;
        render();
      }
    } catch { /* offline for a moment; try again next tick */ }
  }, 8000);
})();
