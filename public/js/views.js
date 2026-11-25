'use strict';

/* Render functions. Each takes the server state (S) and local UI state (U). */
const Views = {
  /* ---------------- Overview ---------------- */
  overview(S) {
    const open = S.requests.filter((r) => r.status !== 'fulfilled');
    const pending = S.requests.reduce((s, r) => s + r.pending_qty, 0);
    const reserved = S.items.reduce((s, i) => s + i.reserved, 0);
    const transit = S.allocations.filter((a) => a.status === 'dispatched');
    const delivered = S.requests.reduce((s, r) => s + r.delivered_qty, 0);
    const blocked = S.roads.filter((r) => r.status === 'blocked').length;
    const kpi = (label, value, sub, alert) =>
      `<div class="kpi${alert ? ' alert' : ''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
    $('#kpis').innerHTML = [
      kpi('Open requests', open.length, `of ${S.requests.length} recorded`),
      kpi('Units pending', fmt.n(pending), 'awaiting stock', pending > 0),
      kpi('Units reserved', fmt.n(reserved), 'held at warehouse'),
      kpi('In transit', transit.length, `${fmt.n(transit.reduce((s, a) => s + a.quantity, 0))} units on the road`),
      kpi('Units delivered', fmt.n(delivered), 'confirmed received'),
      kpi('Roads blocked', blocked, `of ${S.roads.length} links`, blocked > 0),
    ].join('');

    const max = Math.max(1, ...S.items.map((i) => i.on_hand));
    $('#stockBars').innerHTML = S.items.map((i) => `
      <div class="stock-row">
        <div class="stock-name">${esc(i.name)}</div>
        <div class="bar" title="${i.reserved} reserved, ${i.available} available">
          <span class="b-res" style="width:${(i.reserved / max) * 100}%"></span>
          <span class="b-av" style="width:${(i.available / max) * 100}%"></span>
        </div>
        <div class="stock-figs">${fmt.n(i.available)} / ${fmt.n(i.on_hand)} ${esc(i.unit)}</div>
      </div>`).join('') +
      '<div class="bar-legend"><span><i style="background:var(--accent)"></i>Reserved</span><span><i style="background:#8fb2cc"></i>Available</span><span class="muted">Figures: available / on hand</span></div>';

    const areas = S.nodes.filter((n) => n.node_type === 'area').map((n) => {
      const rs = open.filter((r) => r.area_id === n.node_id);
      return {
        name: n.name, count: rs.length,
        pending: rs.reduce((s, r) => s + r.pending_qty, 0),
        top: rs.reduce((m, r) => Math.max(m, r.urgency), 0),
      };
    }).sort((a, b) => b.top - a.top || b.pending - a.pending);
    $('#areaTable').innerHTML = table([
      { label: 'Area', html: (a) => `<b>${esc(a.name)}</b>` },
      { label: 'Open', cls: 'r num', html: (a) => a.count },
      { label: 'Pending units', cls: 'r num', html: (a) => fmt.n(a.pending) },
      { label: 'Highest urgency', html: (a) => (a.top ? fmt.urg(a.top) : '<span class="muted">–</span>') },
    ], areas);

    $('#recentLog').innerHTML = Views.logRows(S.log.slice(0, 7));
  },

  logRows(rows) {
    return table([
      { label: 'Time', cls: 'num', html: (e) => `<span class="muted">${fmt.dateTime(e.logged_at)}</span>` },
      { label: 'Module', html: (e) => esc(e.module) },
      { label: 'Event', cls: 'wrap', html: (e) => esc(e.message) },
    ], rows, { empty: 'No activity yet.' });
  },

  /* ---------------- Module 1 ---------------- */
  requests(S, U) {
    const name = (id) => (S.nodes.find((n) => n.node_id === id) || {}).name || id;
    const itemOf = (id) => S.items.find((i) => i.item_id === id) || { name: id, unit: '' };

    const areaSel = $('#reqForm [name=area_id]');
    const itemSel = $('#reqForm [name=item_id]');
    const keepA = areaSel.value;
    const keepI = itemSel.value;
    areaSel.innerHTML = S.nodes.filter((n) => n.node_type === 'area')
      .map((n) => `<option value="${n.node_id}">${esc(n.name)}</option>`).join('');
    itemSel.innerHTML = S.items.map((i) => `<option value="${i.item_id}">${esc(i.name)}</option>`).join('');
    if (keepA) areaSel.value = keepA;
    if (keepI) itemSel.value = keepI;

    let rows = S.requests;
    if (U.reqFilter === 'open') rows = rows.filter((r) => r.status !== 'fulfilled');
    if (U.reqFilter === 'fulfilled') rows = rows.filter((r) => r.status === 'fulfilled');
    $('#reqTable').innerHTML = table([
      { label: 'ID', cls: 'num', html: (r) => `<b>${r.request_id}</b>` },
      { label: 'Area', html: (r) => esc(name(r.area_id)) },
      { label: 'Item', html: (r) => esc(itemOf(r.item_id).name) },
      { label: 'Qty', cls: 'r num', html: (r) => fmt.n(r.quantity) },
      { label: 'Pending', cls: 'r num', html: (r) => (r.pending_qty ? `<b>${fmt.n(r.pending_qty)}</b>` : '<span class="muted">0</span>') },
      { label: 'Urgency', html: (r) => fmt.urg(r.urgency) },
      { label: 'Time', cls: 'num', html: (r) => `<span class="muted" title="${esc(r.requested_at)}">${fmt.time(r.requested_at)}</span>` },
      { label: 'Status', html: (r) => fmt.status(r.status) },
    ], rows, {
      empty: 'No requests in this view.',
      rowAttr: (r) => `class="clickable${U.editing === r.request_id ? ' selected' : ''}${U.flash.has(r.request_id) ? ' flash' : ''}" data-req="${r.request_id}"`,
    });

    $('#invTable').innerHTML = table([
      { label: 'Item', html: (i) => `<b>${esc(i.name)}</b> <span class="muted mono small">${i.item_id}</span>` },
      { label: 'On hand', cls: 'r num', html: (i) => fmt.n(i.on_hand) },
      { label: 'Reserved', cls: 'r num', html: (i) => fmt.n(i.reserved) },
      { label: 'Available', cls: 'r num', html: (i) => `<b>${fmt.n(i.available)}</b>` },
      { label: 'Unit', html: (i) => `<span class="muted">${esc(i.unit)}</span>` },
      {
        label: 'Restock', cls: 'r',
        html: (i) => `<form class="restock" data-item="${i.item_id}"><input type="number" min="1" step="1" placeholder="Qty" required><button class="btn btn-sm" type="submit">Add</button></form>`,
      },
    ], S.items, { rowAttr: (i) => (U.flash.has(i.item_id) ? 'class="flash"' : '') });

    Views.hash(S, U);
  },

  hash(S, U) {
    const h = S.hash[U.hashMap];
    const L = U.lookup && U.lookup.kind === (U.hashMap === 'requests' ? 'request' : 'item') ? U.lookup : null;
    $('#hashStats').innerHTML = [
      ['Buckets', h.capacity], ['Entries', h.size], ['Load factor', h.loadFactor.toFixed(2)], ['Resizes', h.resizes],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#buckets').innerHTML = h.buckets.map((b, i) => {
      const hit = L && L.bucket === i;
      const keys = b.map((k, j) => `${j ? '<span class="arrow">&rarr;</span>' : ''}<span class="key${hit && k === L.key ? ' match' : ''}">${esc(k)}</span>`).join('');
      return `<div class="bucket${hit ? ' hit' : ''}${b.length ? '' : ' empty-b'}"><span class="idx">${i}</span><span class="chain">${keys || '<span class="muted small">empty</span>'}</span></div>`;
    }).join('');
  },

  lookupText(L) {
    const rec = L.record;
    let detail = '<span style="color:var(--high)">Key not found in this map.</span>';
    if (rec && L.kind === 'request') detail = `Found: ${esc(rec.request_id)}, ${rec.quantity} requested, ${rec.pending_qty} pending, ${fmt.status(rec.status)}`;
    if (rec && L.kind === 'item') detail = `Found: ${esc(rec.name)}, ${rec.on_hand} on hand, ${rec.reserved} reserved`;
    return `djb2(<span class="mono">"${esc(L.key)}"</span>) = <span class="mono">${L.hash}</span><br>
      <span class="mono">${L.hash} mod ${L.capacity} = ${L.bucket}</span> &rarr; bucket ${L.bucket}<br>
      Chain length ${L.chain.length}, ${L.found ? L.comparisons : L.chain.length} key comparison${(L.found ? L.comparisons : L.chain.length) === 1 ? '' : 's'}<br>${detail}`;
  },

  /* ---------------- Module 2 ---------------- */
  allocation(S, U) {
    const q = S.queue;
    const heap = q.heap;
    $('#queueNote').textContent = q.built
      ? `${heap.length} request${heap.length === 1 ? '' : 's'} left in this pass`
      : `${heap.length} request${heap.length === 1 ? '' : 's'} with pending quantity. The queue is built on the first step.`;
    $('#stepBtn').disabled = q.built && heap.length === 0;
    $('#runBtn').disabled = q.built && heap.length === 0;

    // Heap as a tree
    const W = 700;
    const rowH = 82;
    const levels = heap.length ? Math.floor(Math.log2(heap.length)) + 1 : 1;
    const pos = heap.map((_, i) => {
      const L = Math.floor(Math.log2(i + 1));
      const k = i - (2 ** L - 1);
      return { x: ((k + 0.5) * W) / 2 ** L, y: 30 + L * rowH };
    });
    let g = '';
    heap.forEach((_, i) => {
      if (i === 0) return;
      const p = pos[(i - 1) >> 1];
      g += svg('line', { x1: p.x, y1: p.y + 20, x2: pos[i].x, y2: pos[i].y - 20, stroke: '#c4cbd3', 'stroke-width': 1.5 });
    });
    const col = { 3: 'var(--high)', 2: 'var(--med)', 1: 'var(--low)' };
    heap.forEach((h, i) => {
      const { x, y } = pos[i];
      const w = 78;
      g += `<g>
        <rect x="${x - w / 2}" y="${y - 20}" width="${w}" height="40" rx="4" fill="#fff" stroke="${i === 0 ? 'var(--accent)' : '#b8c0c9'}" stroke-width="${i === 0 ? 2 : 1}"/>
        <rect x="${x - w / 2}" y="${y - 20}" width="5" height="40" rx="1" fill="${col[h.urgency]}"/>
        <text x="${x + 3}" y="${y - 4}" text-anchor="middle" font-family="IBM Plex Mono" font-size="12" font-weight="500" fill="#17212b">${esc(h.request_id)}</text>
        <text x="${x + 3}" y="${y + 11}" text-anchor="middle" font-family="IBM Plex Mono" font-size="10.5" fill="#69737e">${h.pending} ${esc(h.item_id)}</text>
      </g>`;
    });
    $('#heapTree').innerHTML = heap.length
      ? `<svg viewBox="0 0 ${W} ${levels * rowH - 20}" role="img" aria-label="Binary heap of requests">${g}</svg>`
      : '<div class="empty">The queue is empty.</div>';
    $('#heapArray').innerHTML = heap.length
      ? heap.map((h, i) => `<div class="cell${i === 0 ? ' top' : ''}" title="${esc(h.area)}, ${URG[h.urgency]}, ${h.requested_at}"><div class="ci">[${i}]</div><div class="cv">${esc(h.request_id)}</div></div>`).join('')
      : '';

    // Step card
    const s = U.lastStep;
    if (!s) {
      const top = heap[0];
      $('#stepCard').innerHTML = top
        ? `<p class="step-empty">Next to be served: <b class="mono">${esc(top.request_id)}</b>, ${esc(top.area)}, ${URG[top.urgency]} urgency, requested ${fmt.dateTime(top.requested_at)}.</p>
           <div class="note">Rule: higher urgency first. For equal urgency, the oldest verified request is served first.</div>`
        : '<p class="step-empty">No requests are waiting for stock.</p>';
    } else if (s.done) {
      $('#stepCard').innerHTML = `<div class="note">${esc(s.message)}</div>`;
    } else {
      $('#stepCard').innerHTML = `
        <div class="step-title"><b>${esc(s.request_id)}</b>${fmt.urg(s.urgency)}</div>
        <div class="muted">${esc(s.area)} &middot; ${esc(s.item)}</div>
        <div class="calc">
          <div><span>Pending quantity</span><span class="v">${fmt.n(s.requested)} ${esc(s.unit)}</span></div>
          <div><span>Available stock</span><span class="v">${fmt.n(s.available)} ${esc(s.unit)}</span></div>
          <div class="em"><span>Reserve min(${s.requested}, ${s.available})</span><span class="v">${fmt.n(s.reserved)} ${esc(s.unit)}</span></div>
          <div><span>Still pending</span><span class="v">${fmt.n(s.pending)} ${esc(s.unit)}</span></div>
          <div><span>Available after</span><span class="v">${fmt.n(s.available_after)} ${esc(s.unit)}</span></div>
        </div>
        <div class="note${s.pending ? ' warn' : ''}">${s.reserved === 0
          ? `No stock available. The full ${s.pending} ${esc(s.unit)} stay pending for the next supply update.`
          : s.pending
            ? `Partly covered. ${s.pending} ${esc(s.unit)} are carried forward for the next supply update.`
            : 'Fully covered. The reservation is ready for route planning and dispatch.'}</div>`;
    }

    // Pass table
    const run = q.run;
    const tot = run.reduce((a, r) => ({ res: a.res + r.reserved, pen: a.pen + r.pending }), { res: 0, pen: 0 });
    $('#runSummary').textContent = run.length ? `${fmt.n(tot.res)} units reserved, ${fmt.n(tot.pen)} units still pending` : '';
    $('#runTable').innerHTML = table([
      { label: '#', cls: 'num', html: (r) => `<span class="muted">${run.indexOf(r) + 1}</span>` },
      { label: 'Request', cls: 'num', html: (r) => `<b>${esc(r.request_id)}</b>` },
      { label: 'Area', html: (r) => esc(r.area) },
      { label: 'Item', html: (r) => esc(r.item) },
      { label: 'Priority', html: (r) => fmt.urg(r.urgency) },
      { label: 'Requested', cls: 'r num', html: (r) => fmt.n(r.requested) },
      { label: 'Available', cls: 'r num', html: (r) => fmt.n(r.available) },
      { label: 'Reserved', cls: 'r num', html: (r) => `<b>${fmt.n(r.reserved)}</b>` },
      { label: 'Pending', cls: 'r num', html: (r) => (r.pending ? `<span style="color:var(--high)">${fmt.n(r.pending)}</span>` : '0') },
    ], run, {
      empty: 'Press Next step to take the first request from the queue.',
      rowAttr: (r) => (run.indexOf(r) === run.length - 1 ? 'class="flash"' : ''),
      foot: run.length ? `<tfoot><tr><td colspan="7">Total</td><td class="r num">${fmt.n(tot.res)}</td><td class="r num">${fmt.n(tot.pen)}</td></tr></tfoot>` : '',
    });
  },

  /* ---------------- Module 3 ---------------- */
  routes(S, U) {
    const name = (id) => (S.nodes.find((n) => n.node_id === id) || {}).name || id;
    const itemOf = (id) => S.items.find((i) => i.item_id === id) || { name: id, unit: '' };

    const reserved = S.allocations.filter((a) => a.status === 'reserved');
    const sel = $('#allocSelect');
    if (U.selectedAlloc && !reserved.some((a) => a.allocation_id === U.selectedAlloc)) U.selectedAlloc = null;
    if (!U.selectedAlloc && reserved.length) U.selectedAlloc = reserved[0].allocation_id;
    sel.innerHTML = reserved.length
      ? reserved.map((a) => `<option value="${a.allocation_id}">#${a.allocation_id} · ${a.request_id} · ${esc(name(a.area_id))} · ${a.quantity} ${esc(itemOf(a.item_id).unit)} ${esc(itemOf(a.item_id).name.toLowerCase())}</option>`).join('')
      : '<option value="">No reserved allocations. Run Module 2 first.</option>';
    sel.disabled = !reserved.length;
    if (U.selectedAlloc) sel.value = String(U.selectedAlloc);
    $('#routeBtn').disabled = !reserved.length || U.animating;
    $('#dispatchBtn').disabled = !(U.route && U.route.reachable && !U.animating && U.route.forAlloc === U.selectedAlloc);

    Views.graph(S, U);
    Views.routeInfo(S, U);

    let rows = S.allocations.slice().reverse();
    if (U.delFilter === 'active') rows = rows.filter((a) => a.status !== 'delivered');
    $('#delTable').innerHTML = table([
      { label: '#', cls: 'num', html: (a) => a.allocation_id },
      { label: 'Request', cls: 'num', html: (a) => `<b>${a.request_id}</b>` },
      { label: 'Area', html: (a) => esc(name(a.area_id)) },
      { label: 'Item', html: (a) => esc(itemOf(a.item_id).name) },
      { label: 'Qty', cls: 'r num', html: (a) => fmt.n(a.quantity) },
      { label: 'Status', html: (a) => fmt.status(a.status) },
      { label: 'Route', html: (a) => (a.route_path ? `<span class="small">${esc(a.route_path)}</span>` : '<span class="muted">–</span>') },
      { label: 'Min', cls: 'r num', html: (a) => fmt.n(a.travel_min) },
      { label: 'Received', cls: 'r num', html: (a) => (a.received_qty === null ? '–' : a.received_qty < a.quantity ? `<span style="color:var(--high)">${a.received_qty}</span>` : a.received_qty) },
      {
        label: '', cls: 'r',
        html: (a) => {
          if (a.status === 'reserved') return `<button class="btn btn-sm" data-plan="${a.allocation_id}">Plan route</button>`;
          if (a.status === 'dispatched') return `<form class="recv" data-recv="${a.allocation_id}"><input type="number" min="0" max="${a.quantity}" value="${a.quantity}" required title="Quantity received"><button class="btn btn-sm btn-primary" type="submit">Confirm receipt</button></form>`;
          return `<span class="muted small">${fmt.dateTime(a.delivered_at)}</span>`;
        },
      },
    ], rows, { empty: U.delFilter === 'active' ? 'No active allocations. Reserve stock in Module 2.' : 'No allocations yet.' });
  },

  graph(S, U) {
    const R = U.route;
    const step = R && U.animating ? R.steps[U.animStep] : null;
    const visited = new Set();
    if (R) {
      const upto = U.animating ? U.animStep : R.steps.length - 1;
      for (let i = 0; i <= upto; i++) visited.add(R.steps[i].visit);
    }
    const dist = R ? (step ? step.dist : R.dist) : null;
    const pathNodes = new Set(R && !U.animating ? R.path : []);
    const pathRoads = new Set(R && !U.animating ? R.roads : []);
    const relax = new Set(step ? step.relaxed.map((r) => r.roadId) : []);
    const N = Object.fromEntries(S.nodes.map((n) => [n.node_id, n]));
    let g = '';

    for (const r of S.roads) {
      const a = N[r.from_node];
      const b = N[r.to_node];
      const mx = (a.pos_x + b.pos_x) / 2;
      const my = (a.pos_y + b.pos_y) / 2;
      const cls = ['edge', r.status === 'blocked' ? 'blocked' : '', pathRoads.has(r.road_id) ? 'path' : '', relax.has(r.road_id) ? 'relax' : ''].join(' ');
      const label = r.status === 'blocked' ? `${r.travel_min} ✕` : r.travel_min;
      const w = r.status === 'blocked' ? 36 : 24;
      g += `<g class="edge-g ${r.status}" data-road="${r.road_id}">
        <title>${esc(N[r.from_node].name)} – ${esc(N[r.to_node].name)}: ${r.travel_min} min (${r.status}). Click to ${r.status === 'open' ? 'block' : 'reopen'}.</title>
        <line class="edge-hit" x1="${a.pos_x}" y1="${a.pos_y}" x2="${b.pos_x}" y2="${b.pos_y}"/>
        <line class="${cls}" x1="${a.pos_x}" y1="${a.pos_y}" x2="${b.pos_x}" y2="${b.pos_y}"/>
        <rect class="w-box" x="${mx - w / 2}" y="${my - 9}" width="${w}" height="18" rx="3"/>
        <text class="w-txt" x="${mx}" y="${my}">${label}</text>
      </g>`;
    }

    for (const n of S.nodes) {
      const cls = ['node', n.node_type, visited.has(n.node_id) ? 'visited' : '', step && step.visit === n.node_id ? 'current' : '',
        pathNodes.has(n.node_id) ? 'on-path' : '', R && R.target === n.node_id ? 'target' : ''].join(' ');
      const shape = n.node_type === 'warehouse'
        ? `<rect x="${n.pos_x - 15}" y="${n.pos_y - 15}" width="30" height="30" rx="3"/>`
        : `<circle cx="${n.pos_x}" cy="${n.pos_y}" r="${n.node_type === 'area' ? 13 : 8}"/>`;
      const d = dist && dist[n.node_id] !== null && dist[n.node_id] !== undefined ? `<text class="n-dist" x="${n.pos_x}" y="${n.pos_y - (n.node_type === 'junction' ? 15 : 21)}">${dist[n.node_id]}</text>` : '';
      g += `<g class="${cls}">${shape}
        <text class="n-label" x="${n.pos_x}" y="${n.pos_y + (n.node_type === 'junction' ? 24 : 32)}">${esc(n.name)}</text>${d}</g>`;
    }
    $('#graph').innerHTML = `<svg viewBox="0 10 900 450" role="img" aria-label="Road network">${g}</svg>`;
  },

  routeInfo(S, U) {
    const R = U.route;
    const name = (id) => (S.nodes.find((n) => n.node_id === id) || {}).name || id;
    if (!R) {
      $('#routeOut').className = 'route-out';
      $('#routeOut').innerHTML = '';
      $('#distTable').innerHTML = '<p class="hint">Find route runs Dijkstra from the Central Warehouse over open roads. Distances in minutes appear above each node as the search settles them.</p>';
      return;
    }
    const step = U.animating ? R.steps[U.animStep] : R.steps[R.steps.length - 1];
    const dist = U.animating ? step.dist : R.dist;
    const visited = new Set(R.steps.slice(0, (U.animating ? U.animStep : R.steps.length - 1) + 1).map((s) => s.visit));

    if (U.animating) {
      $('#routeOut').className = 'route-out';
      $('#routeOut').innerHTML = `Step ${U.animStep + 1} of ${R.steps.length}: settle <b>${esc(name(step.visit))}</b> at ${step.dist[step.visit]} min` +
        (step.relaxed.length ? `, check ${step.relaxed.map((r) => `${esc(name(r.to))} (${r.candidate}${r.improved ? ', shorter' : ''})`).join(', ')}` : '');
    } else if (R.reachable) {
      $('#routeOut').className = 'route-out';
      $('#routeOut').innerHTML = `Shortest known route to <b>${esc(name(R.target))}</b>
        <div class="path">${R.path.map((p) => esc(name(p))).join(' &rarr; ')}</div>
        <span class="mono">${R.distance} min</span> travel time, ${R.path.length - 1} road${R.path.length === 2 ? '' : 's'}`;
    } else {
      $('#routeOut').className = 'route-out bad';
      $('#routeOut').innerHTML = `<b>${esc(name(R.target))}</b> cannot be reached on open roads. Reopen a blocked road to continue.`;
    }

    const rows = S.nodes.map((n) => ({ id: n.node_id, name: n.name, d: dist[n.node_id] }));
    rows.sort((a, b) => (a.d === null) - (b.d === null) || (a.d ?? 0) - (b.d ?? 0));
    $('#distTable').innerHTML = `<table class="dist"><thead><tr><th>Node</th><th class="r">Distance</th><th>State</th></tr></thead><tbody>${
      rows.map((r) => {
        const cur = U.animating && step.visit === r.id;
        const done = visited.has(r.id);
        return `<tr class="${cur ? 'cur' : done ? 'done' : 'unseen'}"><td>${esc(r.name)}</td><td class="r num">${r.d === null ? '&infin;' : r.d}</td><td class="small">${cur ? 'settling' : done ? 'settled' : r.d === null ? 'unreached' : 'in queue'}</td></tr>`;
      }).join('')}</tbody></table>`;
  },

  /* ---------------- Log ---------------- */
  log(S, U) {
    const rows = U.logFilter ? S.log.filter((e) => e.module === U.logFilter) : S.log;
    $('#logTable').innerHTML = Views.logRows(rows);
  },
};
