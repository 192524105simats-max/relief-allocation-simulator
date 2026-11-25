'use strict';

// Generates database/relief_db.sql (schema + starting scenario) from
// database/schema.sql and server/seed.js, so the SQL file and the app's
// reset always hold the same data.

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const seed = require('../server/seed');
const { seedStatements } = require('../server/db');

const root = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8')
  .replace(/^--.*\n/gm, '')
  .trim();

const inserts = seedStatements(seed).map(([sql, params]) => `${mysql.format(sql, params)};`);

const out = `-- ------------------------------------------------------------
-- Disaster Relief Resource Allocation System
-- MySQL database: relief_db
--
-- Import:  mysql -u root -p < relief_db.sql
-- ------------------------------------------------------------

CREATE DATABASE IF NOT EXISTS relief_db CHARACTER SET utf8mb4;
USE relief_db;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS event_log;
DROP TABLE IF EXISTS allocations;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS roads;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS nodes;
SET FOREIGN_KEY_CHECKS = 1;

${schema}

-- Starting scenario -------------------------------------------

${inserts.join('\n')}

INSERT INTO event_log (logged_at, module, message) VALUES (NOW(), 'System', 'Database initialised with the starting scenario');

-- Useful views ------------------------------------------------

CREATE OR REPLACE VIEW v_inventory AS
  SELECT item_id, name, unit, on_hand, reserved, on_hand - reserved AS available
    FROM items;

CREATE OR REPLACE VIEW v_priority_queue AS
  SELECT r.request_id, n.name AS area, i.name AS item, r.pending_qty,
         CASE r.urgency WHEN 3 THEN 'High' WHEN 2 THEN 'Medium' ELSE 'Low' END AS urgency,
         r.requested_at
    FROM requests r
    JOIN nodes n ON n.node_id = r.area_id
    JOIN items i ON i.item_id = r.item_id
   WHERE r.pending_qty > 0
   ORDER BY r.urgency DESC, r.requested_at ASC;

CREATE OR REPLACE VIEW v_deliveries AS
  SELECT a.allocation_id, a.request_id, n.name AS area, i.name AS item, a.quantity,
         a.status, a.route_path, a.travel_min, a.received_qty,
         a.quantity - COALESCE(a.received_qty, a.quantity) AS shortfall,
         a.created_at, a.dispatched_at, a.delivered_at
    FROM allocations a
    JOIN nodes n ON n.node_id = a.area_id
    JOIN items i ON i.item_id = a.item_id;
`;

fs.writeFileSync(path.join(root, 'database', 'relief_db.sql'), out);
console.log('Wrote database/relief_db.sql');
