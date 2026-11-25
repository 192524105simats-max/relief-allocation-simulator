-- ------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS nodes (
  node_id    VARCHAR(10)  NOT NULL,
  name       VARCHAR(60)  NOT NULL,
  node_type  ENUM('warehouse','junction','area') NOT NULL,
  pos_x      SMALLINT     NOT NULL DEFAULT 0,
  pos_y      SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roads (
  road_id     VARCHAR(10) NOT NULL,
  from_node   VARCHAR(10) NOT NULL,
  to_node     VARCHAR(10) NOT NULL,
  travel_min  INT UNSIGNED NOT NULL,
  status      ENUM('open','blocked') NOT NULL DEFAULT 'open',
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (road_id),
  KEY idx_roads_from (from_node),
  KEY idx_roads_to (to_node),
  CONSTRAINT fk_roads_from FOREIGN KEY (from_node) REFERENCES nodes (node_id) ON DELETE CASCADE,
  CONSTRAINT fk_roads_to   FOREIGN KEY (to_node)   REFERENCES nodes (node_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS items (
  item_id   VARCHAR(10)  NOT NULL,
  name      VARCHAR(60)  NOT NULL,
  unit      VARCHAR(20)  NOT NULL,
  on_hand   INT UNSIGNED NOT NULL DEFAULT 0,
  reserved  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS requests (
  request_id    VARCHAR(12)  NOT NULL,
  area_id       VARCHAR(10)  NOT NULL,
  item_id       VARCHAR(10)  NOT NULL,
  quantity      INT UNSIGNED NOT NULL,
  pending_qty   INT UNSIGNED NOT NULL,
  delivered_qty INT UNSIGNED NOT NULL DEFAULT 0,
  urgency       TINYINT UNSIGNED NOT NULL COMMENT '3 = High, 2 = Medium, 1 = Low',
  requested_at  DATETIME     NOT NULL,
  status        ENUM('pending','partial','allocated','fulfilled') NOT NULL DEFAULT 'pending',
  PRIMARY KEY (request_id),
  KEY idx_requests_queue (status, urgency, requested_at),
  CONSTRAINT fk_requests_area FOREIGN KEY (area_id) REFERENCES nodes (node_id),
  CONSTRAINT fk_requests_item FOREIGN KEY (item_id) REFERENCES items (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS allocations (
  allocation_id  INT UNSIGNED NOT NULL,
  request_id     VARCHAR(12)  NOT NULL,
  item_id        VARCHAR(10)  NOT NULL,
  area_id        VARCHAR(10)  NOT NULL,
  quantity       INT UNSIGNED NOT NULL,
  status         ENUM('reserved','dispatched','delivered') NOT NULL DEFAULT 'reserved',
  route_path     VARCHAR(200) NULL,
  travel_min     INT UNSIGNED NULL,
  received_qty   INT UNSIGNED NULL,
  created_at     DATETIME     NOT NULL,
  dispatched_at  DATETIME     NULL,
  delivered_at   DATETIME     NULL,
  PRIMARY KEY (allocation_id),
  KEY idx_alloc_request (request_id),
  KEY idx_alloc_status (status),
  CONSTRAINT fk_alloc_request FOREIGN KEY (request_id) REFERENCES requests (request_id) ON DELETE CASCADE,
  CONSTRAINT fk_alloc_item    FOREIGN KEY (item_id)    REFERENCES items (item_id),
  CONSTRAINT fk_alloc_area    FOREIGN KEY (area_id)    REFERENCES nodes (node_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_log (
  event_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  logged_at  DATETIME     NOT NULL,
  module     VARCHAR(20)  NOT NULL,
  message    VARCHAR(255) NOT NULL,
  PRIMARY KEY (event_id),
  KEY idx_log_time (logged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Starting scenario -------------------------------------------

INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('WH', 'Central Warehouse', 'warehouse', 70, 250);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('JA', 'Junction A', 'junction', 250, 140);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('JB', 'Junction B', 'junction', 250, 380);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('JC', 'Junction C', 'junction', 440, 60);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('JD', 'Junction D', 'junction', 440, 400);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('W07', 'Ward 7', 'area', 600, 200);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('W03', 'Ward 3', 'area', 650, 50);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('W09', 'Ward 9', 'area', 640, 400);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('W12', 'Ward 12', 'area', 800, 300);
INSERT INTO nodes (node_id, name, node_type, pos_x, pos_y) VALUES ('SC2', 'Shelter Camp 2', 'area', 830, 120);
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R01', 'WH', 'JA', 8, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R02', 'WH', 'JB', 10, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R03', 'JA', 'W07', 7, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R04', 'JB', 'W07', 12, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R05', 'JA', 'JC', 6, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R06', 'JC', 'W03', 5, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R07', 'JC', 'W07', 9, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R08', 'JB', 'JD', 7, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R09', 'JD', 'W09', 6, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R10', 'W07', 'W12', 8, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R11', 'W09', 'W12', 9, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R12', 'W03', 'SC2', 7, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R13', 'W12', 'SC2', 10, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R14', 'W07', 'SC2', 13, 'open');
INSERT INTO roads (road_id, from_node, to_node, travel_min, status) VALUES ('R15', 'W07', 'W09', 11, 'open');
INSERT INTO items (item_id, name, unit, on_hand, reserved) VALUES ('WTR', 'Water packs', 'packs', 120, 0);
INSERT INTO items (item_id, name, unit, on_hand, reserved) VALUES ('FOOD', 'Food kits', 'kits', 150, 0);
INSERT INTO items (item_id, name, unit, on_hand, reserved) VALUES ('MED', 'Medicine kits', 'kits', 45, 0);
INSERT INTO items (item_id, name, unit, on_hand, reserved) VALUES ('HYG', 'Hygiene kits', 'kits', 70, 0);
INSERT INTO items (item_id, name, unit, on_hand, reserved) VALUES ('TARP', 'Tarpaulin sheets', 'sheets', 30, 0);
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-101', 'W07', 'WTR', 80, 80, 0, 3, '2026-11-25 06:10:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-102', 'W03', 'WTR', 60, 60, 0, 2, '2026-11-25 06:25:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-103', 'W09', 'WTR', 40, 40, 0, 1, '2026-11-25 06:40:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-104', 'SC2', 'FOOD', 90, 90, 0, 3, '2026-11-25 06:15:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-105', 'W12', 'FOOD', 70, 70, 0, 2, '2026-11-25 06:50:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-106', 'W07', 'MED', 25, 25, 0, 3, '2026-11-25 07:05:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-107', 'SC2', 'MED', 30, 30, 0, 2, '2026-11-25 07:20:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-108', 'W09', 'HYG', 50, 50, 0, 2, '2026-11-25 07:30:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-109', 'SC2', 'TARP', 40, 40, 0, 3, '2026-11-25 07:45:00', 'pending');
INSERT INTO requests (request_id, area_id, item_id, quantity, pending_qty, delivered_qty, urgency, requested_at, status) VALUES ('R-110', 'W03', 'HYG', 35, 35, 0, 1, '2026-11-25 08:00:00', 'pending');

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
