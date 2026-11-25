'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const SCHEMA_FILE = path.join(__dirname, '..', 'database', 'schema.sql');

let pool = null;
let info = { connected: false, host: null, database: null, error: null };

/**
 * Connection settings. Either DATABASE_URL (as given by cloud MySQL providers,
 * e.g. mysql://user:pass@host:port/db?ssl-mode=REQUIRED) or the DB_* variables.
 */
function config() {
  let cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'relief_db',
  };
  let sslWanted = /^(1|true|required)$/i.test(process.env.DB_SSL || '');
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    cfg = {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || cfg.database,
    };
    const mode = u.searchParams.get('ssl-mode') || u.searchParams.get('sslmode') || '';
    if (/required|verify/i.test(mode)) sslWanted = true;
  }
  if (process.env.DB_NAME && process.env.DATABASE_URL) cfg.database = process.env.DB_NAME;
  if (sslWanted || process.env.DB_SSL_CA) {
    // With the provider's CA certificate the server identity is verified;
    // without it the connection is still encrypted.
    const ca = process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined;
    cfg.ssl = ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
  }
  return cfg;
}

/** Insert statements for a full scenario, shared with scripts/build-sql.js. */
function seedStatements(seed) {
  const s = [];
  for (const n of seed.nodes) {
    s.push(['INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)',
      [n.node_id, n.name, n.node_type, n.pos_x, n.pos_y]]);
  }
  for (const r of seed.roads) {
    s.push(['INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES (?, ?, ?, ?, ?)',
      [r.road_id, r.from_node, r.to_node, r.travel_min, r.status]]);
  }
  for (const i of seed.items) {
    s.push(['INSERT INTO items (item_id, name, unit, on_hand, reserved) VALUES (?, ?, ?, ?, ?)',
      [i.item_id, i.name, i.unit, i.on_hand, i.reserved]]);
  }
  for (const r of seed.requests) {
    s.push([
      'INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
      [r.request_id, r.area_id, r.item_id, r.quantity, r.quantity, r.urgency, r.requested_at, 'pending'],
    ]);
  }
  return s;
}

const CLEAR_STATEMENTS = [
  ['DELETE FROM allocations', []],
  ['DELETE FROM requests', []],
  ['DELETE FROM roads', []],
  ['DELETE FROM items', []],
  ['DELETE FROM nodes', []],
  ['DELETE FROM event_log', []],
];

async function connect() {
  const cfg = config();
  info = { connected: false, host: `${cfg.host}:${cfg.port}`, database: cfg.database, error: null };
  try {
    // Create the database on first run, then open a pool on it.
    const { database, ...server } = cfg;
    const boot = await mysql.createConnection({ ...server, connectTimeout: 15000 });
    try {
      await boot.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4`);
    } catch (e) {
      // Hosted plans may not allow CREATE DATABASE; the database must then already exist.
      if (e.code !== 'ER_DBACCESS_DENIED_ERROR' && e.code !== 'ER_ACCESS_DENIED_ERROR') throw e;
    }
    await boot.end();

    pool = mysql.createPool({
      ...cfg,
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
      multipleStatements: true,
    });
    await pool.query(fs.readFileSync(SCHEMA_FILE, 'utf8'));
    info.connected = true;
  } catch (err) {
    const hints = {
      ECONNREFUSED: 'MySQL server is not running on this computer',
      ER_ACCESS_DENIED_ERROR: 'wrong MySQL user or password in .env',
      ETIMEDOUT: 'database server did not answer (check host, port and firewall)',
      ENOTFOUND: 'DB_HOST in .env cannot be found',
    };
    info.error = err.code ? `${err.code}: ${hints[err.code] || err.message}` : err.message;
    if (pool) await pool.end().catch(() => {});
    pool = null;
  }
  return info;
}

function status() {
  return { ...info };
}

/** Run a list of [sql, params] statements as one transaction. */
async function transaction(statements) {
  if (!pool) return;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [sql, params] of statements) await conn.execute(sql, params);
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

async function isEmpty() {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM nodes');
  return rows[0].n === 0;
}

async function reseed(seed, logEntry) {
  await transaction([
    ...CLEAR_STATEMENTS,
    ...seedStatements(seed),
    ['INSERT INTO event_log (logged_at, module, message) VALUES (?, ?, ?)', logEntry],
  ]);
}

async function loadAll() {
  const q = async (sql) => (await pool.query(sql))[0];
  return {
    nodes: await q('SELECT node_id, name, node_type, pos_x, pos_y FROM nodes ORDER BY node_id'),
    roads: await q('SELECT road_id, from_node, to_node, travel_min, status FROM roads ORDER BY road_id'),
    items: await q('SELECT item_id, name, unit, on_hand, reserved FROM items ORDER BY item_id'),
    requests: await q(`SELECT request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency,
                              requested_at, status FROM requests ORDER BY requested_at`),
    allocations: await q(`SELECT allocation_id, request_id, item_id, area_id, quantity, status, route_path,
                                 travel_min, received_qty, created_at, dispatched_at, delivered_at
                            FROM allocations ORDER BY allocation_id`),
    log: await q('SELECT event_id, logged_at, module, message FROM event_log ORDER BY event_id DESC LIMIT 300'),
  };
}

module.exports = { connect, status, transaction, isEmpty, reseed, loadAll, seedStatements, CLEAR_STATEMENTS };
