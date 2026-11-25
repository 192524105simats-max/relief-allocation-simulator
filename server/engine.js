'use strict';

const HashMap = require('./structures/HashMap');
const PriorityQueue = require('./structures/PriorityQueue');
const Graph = require('./structures/Graph');
const db = require('./db');
const seed = require('./seed');

const URGENCY = { 3: 'High', 2: 'Medium', 1: 'Low' };
const LOG_SQL = 'INSERT INTO event_log (logged_at, module, message) VALUES (?, ?, ?)';

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Serve higher urgency first; for equal urgency, the oldest request first. */
function requestOrder(a, b) {
  if (a.urgency !== b.urgency) return b.urgency - a.urgency;
  if (a.requested_at !== b.requested_at) return a.requested_at < b.requested_at ? -1 : 1;
  return a.request_id < b.request_id ? -1 : 1;
}

function deriveStatus(r, openAllocations) {
  if (r.delivered_qty >= r.quantity) return 'fulfilled';
  if (r.pending_qty === 0) return 'allocated';
  if (r.pending_qty < r.quantity || openAllocations > 0 || r.delivered_qty > 0) return 'partial';
  return 'pending';
}

function toInt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

class Engine {
  constructor() {
    this.nodes = new HashMap();
    this.items = new HashMap();
    this.requests = new HashMap();
    this.roads = new HashMap();
    this.allocations = [];
    this.log = [];
    this.queue = null; // PriorityQueue of request ids, built on demand
    this.run = []; // results of the current allocation pass
    this.nextAllocId = 1;
    this.nextEventId = 1;
  }

  /* ---------- loading ---------- */

  async init() {
    const status = await db.connect();
    if (status.connected) {
      if (await db.isEmpty()) await db.reseed(seed, [now(), 'System', 'Database initialised with the starting scenario']);
      this._load(await db.loadAll());
    } else {
      this._loadSeed();
      this._pushLog('System', 'MySQL unavailable - running on in-memory data');
    }
    return status;
  }

  async reconnect() {
    const status = await db.connect();
    if (status.connected) {
      if (await db.isEmpty()) await db.reseed(seed, [now(), 'System', 'Database initialised with the starting scenario']);
      this._load(await db.loadAll());
    }
    return status;
  }

  async reset() {
    if (db.status().connected) {
      await db.reseed(seed, [now(), 'System', 'Simulation reset to the starting scenario']);
      this._load(await db.loadAll());
    } else {
      this._loadSeed();
      this._pushLog('System', 'Simulation reset to the starting scenario');
    }
  }

  _loadSeed() {
    this._load({
      nodes: seed.nodes,
      roads: seed.roads,
      items: seed.items,
      requests: seed.requests.map((r) => ({ ...r, pending_qty: r.quantity, delivered_qty: 0, status: 'pending' })),
      allocations: [],
      log: [],
    });
  }

  _load(data) {
    const clone = (o) => JSON.parse(JSON.stringify(o));
    this.nodes.clear();
    this.items.clear();
    this.requests.clear();
    this.roads.clear();
    for (const n of data.nodes) this.nodes.set(n.node_id, clone(n));
    for (const r of data.roads) this.roads.set(r.road_id, { ...clone(r), travel_min: Number(r.travel_min) });
    for (const i of data.items) {
      this.items.set(i.item_id, { ...clone(i), on_hand: Number(i.on_hand), reserved: Number(i.reserved) });
    }
    for (const r of data.requests) {
      this.requests.set(r.request_id, {
        ...clone(r),
        quantity: Number(r.quantity),
        pending_qty: Number(r.pending_qty),
        delivered_qty: Number(r.delivered_qty),
        urgency: Number(r.urgency),
      });
    }
    this.allocations = data.allocations.map((a) => ({
      ...clone(a),
      quantity: Number(a.quantity),
      travel_min: a.travel_min === null ? null : Number(a.travel_min),
      received_qty: a.received_qty === null ? null : Number(a.received_qty),
    }));
    this.log = clone(data.log);
    this.nextAllocId = this.allocations.reduce((m, a) => Math.max(m, a.allocation_id), 0) + 1;
    this.nextEventId = this.log.reduce((m, e) => Math.max(m, e.event_id), 0) + 1;
    this.queue = null;
    this.run = [];
  }

  /** Write to MySQL first; only change memory once the transaction commits. */
  async _commit(statements, logs, apply) {
    const stamp = now();
    const all = [...statements, ...logs.map(([m, msg]) => [LOG_SQL, [stamp, m, msg]])];
    if (db.status().connected) {
      try {
        await db.transaction(all);
      } catch (err) {
        throw new AppError(500, `Database write failed: ${err.message}`);
      }
    }
    apply();
    for (const [m, msg] of logs) this._pushLog(m, msg, stamp);
  }

  _pushLog(module, message, stamp = now()) {
    this.log.unshift({ event_id: this.nextEventId++, logged_at: stamp, module, message });
    if (this.log.length > 300) this.log.length = 300;
  }

  _available(item) {
    return item.on_hand - item.reserved;
  }

  _openAllocations(requestId) {
    return this.allocations.filter((a) => a.request_id === requestId && a.status !== 'delivered').length;
  }

  _name(nodeId) {
    const n = this.nodes.get(nodeId);
    return n ? n.name : nodeId;
  }

  _invalidateQueue() {
    this.queue = null;
    this.run = [];
  }

  /* ---------- Module 1: requests and inventory ---------- */

  async addRequest(body) {
    const id = String(body.request_id || '').trim().toUpperCase();
    const areaId = String(body.area_id || '');
    const itemId = String(body.item_id || '');
    const qty = toInt(body.quantity);
    const urgency = toInt(body.urgency);
    const requestedAt = body.requested_at ? String(body.requested_at).replace('T', ' ').slice(0, 19) : now();

    if (!/^R-\d{3,6}$/.test(id)) throw new AppError(400, 'Request ID must look like R-111.');
    if (this.requests.has(id)) throw new AppError(409, `Request ${id} already exists. Duplicate IDs are rejected.`);
    const area = this.nodes.get(areaId);
    if (!area || area.node_type !== 'area') throw new AppError(400, 'Choose a valid affected area.');
    const item = this.items.get(itemId);
    if (!item) throw new AppError(400, 'Choose a valid item.');
    if (!(qty > 0 && qty <= 100000)) throw new AppError(400, 'Quantity must be a whole number between 1 and 100000.');
    if (!URGENCY[urgency]) throw new AppError(400, 'Urgency must be High, Medium or Low.');
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(requestedAt)) throw new AppError(400, 'Invalid request time.');
    const at = requestedAt.length === 16 ? `${requestedAt}:00` : requestedAt;

    const rec = {
      request_id: id, area_id: areaId, item_id: itemId, quantity: qty, pending_qty: qty,
      delivered_qty: 0, urgency, requested_at: at, status: 'pending',
    };
    await this._commit(
      [['INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
        [id, areaId, itemId, qty, qty, urgency, at, 'pending']]],
      [['Requests', `${id} recorded: ${area.name} needs ${qty} ${item.unit} of ${item.name.toLowerCase()} (${URGENCY[urgency]})`]],
      () => {
        this.requests.set(id, rec);
        this._invalidateQueue();
      },
    );
    return rec;
  }

  async updateRequest(id, body) {
    const r = this.requests.get(id);
    if (!r) throw new AppError(404, `Request ${id} not found.`);
    const qty = body.quantity === undefined ? r.quantity : toInt(body.quantity);
    const urgency = body.urgency === undefined ? r.urgency : toInt(body.urgency);
    const committed = r.quantity - r.pending_qty; // reserved, in transit or delivered
    if (!(qty > 0 && qty <= 100000)) throw new AppError(400, 'Quantity must be a whole number between 1 and 100000.');
    if (qty < committed) throw new AppError(400, `Quantity cannot go below ${committed}, which is already reserved or delivered.`);
    if (!URGENCY[urgency]) throw new AppError(400, 'Urgency must be High, Medium or Low.');

    const next = { ...r, quantity: qty, urgency, pending_qty: qty - committed };
    next.status = deriveStatus(next, this._openAllocations(id));
    await this._commit(
      [['UPDATE requests SET quantity = ?, urgency = ?, pending_qty = ?, status = ? WHERE request_id = ?',
        [next.quantity, next.urgency, next.pending_qty, next.status, id]]],
      [['Requests', `${id} updated: quantity ${qty}, urgency ${URGENCY[urgency]}`]],
      () => {
        Object.assign(r, next);
        this._invalidateQueue();
      },
    );
    return r;
  }

  async deleteRequest(id) {
    const r = this.requests.get(id);
    if (!r) throw new AppError(404, `Request ${id} not found.`);
    if (this.allocations.some((a) => a.request_id === id)) {
      throw new AppError(400, `${id} already has allocations and is kept for the record.`);
    }
    await this._commit(
      [['DELETE FROM requests WHERE request_id = ?', [id]]],
      [['Requests', `${id} withdrawn`]],
      () => {
        this.requests.delete(id);
        this._invalidateQueue();
      },
    );
  }

  async addItem(body) {
    const id = String(body.item_id || '').trim().toUpperCase();
    const name = String(body.name || '').trim();
    const unit = String(body.unit || '').trim().toLowerCase();
    const qty = toInt(body.on_hand ?? 0);
    if (!/^[A-Z]{2,10}$/.test(id)) throw new AppError(400, 'Item ID must be 2 to 10 letters.');
    if (this.items.has(id)) throw new AppError(409, `Item ${id} already exists.`);
    if (!name || name.length > 60) throw new AppError(400, 'Enter an item name.');
    if (!unit || unit.length > 20) throw new AppError(400, 'Enter a unit, for example kits.');
    if (!(qty >= 0 && qty <= 1000000)) throw new AppError(400, 'Opening stock must be 0 or more.');
    const rec = { item_id: id, name, unit, on_hand: qty, reserved: 0 };
    await this._commit(
      [['INSERT INTO items (item_id, name, unit, on_hand, reserved) VALUES (?, ?, ?, ?, 0)', [id, name, unit, qty]]],
      [['Inventory', `New item ${name} (${id}) added with ${qty} ${unit}`]],
      () => this.items.set(id, rec),
    );
    return rec;
  }

  async restock(itemId, body) {
    const item = this.items.get(itemId);
    if (!item) throw new AppError(404, `Item ${itemId} not found.`);
    const qty = toInt(body.quantity);
    if (!(qty > 0 && qty <= 1000000)) throw new AppError(400, 'Restock quantity must be a whole number above 0.');
    await this._commit(
      [['UPDATE items SET on_hand = on_hand + ? WHERE item_id = ?', [qty, itemId]]],
      [['Inventory', `${qty} ${item.unit} of ${item.name.toLowerCase()} received at the warehouse`]],
      () => {
        item.on_hand += qty;
        this._invalidateQueue();
      },
    );
    return item;
  }

  lookup(key) {
    const k = String(key || '').trim().toUpperCase();
    const map = k.startsWith('R-') ? this.requests : this.items;
    const kind = map === this.requests ? 'request' : 'item';
    const bucket = map.indexOf(k);
    const chain = map.snapshot().buckets[bucket];
    return {
      key: k, kind, hash: HashMap.hash(k), capacity: map.buckets.length, bucket,
      comparisons: Math.max(1, chain.indexOf(k) + 1 || chain.length), chain,
      found: map.has(k), record: map.get(k) || null,
    };
  }

  /* ---------- Module 2: priority and allocation ---------- */

  _buildQueue() {
    this.queue = new PriorityQueue((a, b) => requestOrder(this.requests.get(a), this.requests.get(b)));
    for (const r of this.requests.values()) if (r.pending_qty > 0) this.queue.push(r.request_id);
    this.run = [];
  }

  queueView() {
    const ids = this.queue ? this.queue.toArray() : this._previewQueue();
    return {
      built: !!this.queue,
      heap: ids.map((id) => {
        const r = this.requests.get(id);
        return { request_id: id, urgency: r.urgency, requested_at: r.requested_at, area: this._name(r.area_id), item_id: r.item_id, pending: r.pending_qty };
      }),
      run: this.run,
    };
  }

  _previewQueue() {
    const pq = new PriorityQueue((a, b) => requestOrder(this.requests.get(a), this.requests.get(b)));
    for (const r of this.requests.values()) if (r.pending_qty > 0) pq.push(r.request_id);
    return pq.toArray();
  }

  async allocateStep() {
    if (!this.queue) this._buildQueue();
    if (this.queue.isEmpty()) return { done: true, message: 'The queue is empty. Every request with a pending quantity has been considered.' };

    const id = this.queue.peek();
    const r = this.requests.get(id);
    const item = this.items.get(r.item_id);
    const available = this._available(item);
    const reserve = Math.min(r.pending_qty, available);
    const pendingAfter = r.pending_qty - reserve;
    const stamp = now();

    const result = {
      done: false,
      request_id: id,
      area: this._name(r.area_id),
      item: item.name,
      unit: item.unit,
      urgency: r.urgency,
      requested: r.pending_qty,
      available,
      reserved: reserve,
      pending: pendingAfter,
      available_after: available - reserve,
    };

    const stmts = [];
    const logs = [];
    let alloc = null;
    if (reserve > 0) {
      alloc = {
        allocation_id: this.nextAllocId, request_id: id, item_id: r.item_id, area_id: r.area_id,
        quantity: reserve, status: 'reserved', route_path: null, travel_min: null, received_qty: null,
        created_at: stamp, dispatched_at: null, delivered_at: null,
      };
      const nextStatus = deriveStatus({ ...r, pending_qty: pendingAfter }, this._openAllocations(id) + 1);
      stmts.push(
        ['INSERT INTO allocations (allocation_id, request_id, item_id, area_id, quantity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [alloc.allocation_id, id, r.item_id, r.area_id, reserve, 'reserved', stamp]],
        ['UPDATE items SET reserved = reserved + ? WHERE item_id = ?', [reserve, r.item_id]],
        ['UPDATE requests SET pending_qty = ?, status = ? WHERE request_id = ?', [pendingAfter, nextStatus, id]],
      );
      logs.push(['Allocation', `${id} (${URGENCY[r.urgency]}): reserved ${reserve} of ${result.requested} ${item.unit} for ${result.area}` +
        (pendingAfter ? `, ${pendingAfter} still pending` : '')]);
      result.allocation_id = alloc.allocation_id;
      result.nextStatus = nextStatus;
    } else {
      logs.push(['Allocation', `${id} (${URGENCY[r.urgency]}): no ${item.name.toLowerCase()} available, ${pendingAfter} kept pending`]);
    }

    await this._commit(stmts, logs, () => {
      this.queue.pop();
      if (alloc) {
        this.allocations.push(alloc);
        this.nextAllocId++;
        item.reserved += reserve;
        r.pending_qty = pendingAfter;
        r.status = result.nextStatus;
      }
      this.run.push(result);
    });
    result.remaining = this.queue.size;
    return result;
  }

  async allocateAll() {
    if (!this.queue) this._buildQueue();
    const steps = [];
    while (!this.queue.isEmpty()) steps.push(await this.allocateStep());
    return { steps };
  }

  resetQueue() {
    this._invalidateQueue();
    return this.queueView();
  }

  /* ---------- Module 3: routes and delivery ---------- */

  _graph() {
    const g = new Graph();
    for (const n of this.nodes.values()) g.addNode(n.node_id);
    for (const r of this.roads.values()) g.addRoad(r);
    return g;
  }

  _warehouse() {
    return this.nodes.values().find((n) => n.node_type === 'warehouse');
  }

  route(target) {
    if (!this.nodes.has(target)) throw new AppError(400, 'Unknown destination.');
    return this._graph().dijkstra(this._warehouse().node_id, target);
  }

  async toggleRoad(roadId) {
    const road = this.roads.get(roadId);
    if (!road) throw new AppError(404, `Road ${roadId} not found.`);
    const next = road.status === 'open' ? 'blocked' : 'open';
    await this._commit(
      [['UPDATE roads SET status = ? WHERE road_id = ?', [next, roadId]]],
      [['Routing', `Road ${this._name(road.from_node)} - ${this._name(road.to_node)} marked ${next}`]],
      () => { road.status = next; },
    );
    return road;
  }

  async dispatch(allocationId) {
    const a = this.allocations.find((x) => x.allocation_id === Number(allocationId));
    if (!a) throw new AppError(404, 'Allocation not found.');
    if (a.status !== 'reserved') throw new AppError(400, 'Only reserved allocations can be dispatched.');
    const plan = this.route(a.area_id);
    if (!plan.reachable) throw new AppError(409, `${this._name(a.area_id)} cannot be reached on open roads. Reopen a road or wait for an update.`);
    const item = this.items.get(a.item_id);
    const pathText = plan.path.map((id) => this._name(id)).join(' > ');
    const stamp = now();

    await this._commit(
      [
        ['UPDATE allocations SET status = ?, route_path = ?, travel_min = ?, dispatched_at = ? WHERE allocation_id = ?',
          ['dispatched', pathText, plan.distance, stamp, a.allocation_id]],
        ['UPDATE items SET on_hand = on_hand - ?, reserved = reserved - ? WHERE item_id = ?', [a.quantity, a.quantity, a.item_id]],
      ],
      [['Delivery', `Allocation #${a.allocation_id}: ${a.quantity} ${item.unit} of ${item.name.toLowerCase()} dispatched to ${this._name(a.area_id)} via ${pathText} (${plan.distance} min)`]],
      () => {
        Object.assign(a, { status: 'dispatched', route_path: pathText, travel_min: plan.distance, dispatched_at: stamp });
        item.on_hand -= a.quantity;
        item.reserved -= a.quantity;
      },
    );
    return { allocation: a, route: plan };
  }

  async receive(allocationId, body) {
    const a = this.allocations.find((x) => x.allocation_id === Number(allocationId));
    if (!a) throw new AppError(404, 'Allocation not found.');
    if (a.status !== 'dispatched') throw new AppError(400, 'Only dispatched allocations can be confirmed.');
    const received = toInt(body.received);
    if (!(received >= 0 && received <= a.quantity)) throw new AppError(400, `Received quantity must be between 0 and ${a.quantity}.`);
    const shortfall = a.quantity - received;
    const r = this.requests.get(a.request_id);
    const item = this.items.get(a.item_id);
    const next = { ...r, delivered_qty: r.delivered_qty + received, pending_qty: r.pending_qty + shortfall };
    next.status = deriveStatus(next, this._openAllocations(r.request_id) - 1);
    const stamp = now();

    await this._commit(
      [
        ['UPDATE allocations SET status = ?, received_qty = ?, delivered_at = ? WHERE allocation_id = ?', ['delivered', received, stamp, a.allocation_id]],
        ['UPDATE requests SET delivered_qty = ?, pending_qty = ?, status = ? WHERE request_id = ?',
          [next.delivered_qty, next.pending_qty, next.status, r.request_id]],
      ],
      [['Delivery', `Allocation #${a.allocation_id}: ${received} of ${a.quantity} ${item.unit} received at ${this._name(a.area_id)}` +
        (shortfall ? `, ${shortfall} carried forward on ${r.request_id}` : '')]],
      () => {
        Object.assign(a, { status: 'delivered', received_qty: received, delivered_at: stamp });
        Object.assign(r, next);
        if (shortfall) this._invalidateQueue();
      },
    );
    return a;
  }

  /* ---------- state ---------- */

  state() {
    const sortById = (a, b) => (a.request_id < b.request_id ? -1 : 1);
    return {
      db: db.status(),
      nodes: this.nodes.values().sort((a, b) => (a.node_id < b.node_id ? -1 : 1)),
      roads: this.roads.values().sort((a, b) => (a.road_id < b.road_id ? -1 : 1)),
      items: this.items.values().sort((a, b) => (a.item_id < b.item_id ? -1 : 1))
        .map((i) => ({ ...i, available: this._available(i) })),
      requests: this.requests.values().sort(sortById),
      allocations: this.allocations,
      log: this.log.slice(0, 200),
      queue: this.queueView(),
      hash: { requests: this.requests.snapshot(), items: this.items.snapshot() },
    };
  }
}

module.exports = { Engine, AppError };
