-- Disaster Relief Resource Allocation System
-- Table definitions (MySQL 8.0+ / MariaDB 10.5+)

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
