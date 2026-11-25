# Disaster Relief Resource Allocation System — Web Simulation

A working web simulation of the capstone project *Disaster relief resource allocation system*
(Data Structures, SIMATS Engineering). It links area-wise relief requests with warehouse stock,
reserves supplies by priority, plans delivery routes over a road network that can change, and
records dispatch, receipt and any shortfall. All data is stored in MySQL.

| Module | What it simulates | Data structure |
|---|---|---|
| 1. Requests & Inventory | Record requests (area, item, quantity, urgency, time); validate; reject duplicate IDs; restock items | Hash map with separate chaining (`server/structures/HashMap.js`) |
| 2. Priority & Allocation | Serve higher urgency first, oldest first on ties; reserve `min(pending, available)`; keep the rest pending | Binary heap priority queue (`server/structures/PriorityQueue.js`) |
| 3. Routes & Delivery | Block/reopen roads; shortest route from the warehouse; dispatch; confirm receipt; carry shortfall forward | Weighted graph + Dijkstra (`server/structures/Graph.js`) |

The starting scenario follows the examples in the presentation: 120 water packs shared by
Ward 7 (High, 80), Ward 3 (Medium, 60) and Ward 9 (Low, 40) gives 80 / 40 / 0 reserved with
60 pending, and the route Warehouse → Junction A → Ward 7 takes 15 min against 22 min via Junction B.

## Quick start

See **HOW-TO-RUN.txt**. In short: install Node.js and MySQL, put your MySQL password in `.env`,
then double-click `start-windows.bat` (Windows) or `start-mac.command` (macOS). Dependencies are
already included in `node_modules`, so no internet connection is needed to start it.

## Requirements

- Node.js 18 or later
- MySQL 8.0+ (or MariaDB 10.5+)

## Setup

1. **Create the database.** Import the SQL file (creates `relief_db`, all tables, views and the starting data):

   ```bash
   mysql -u root -p < database/relief_db.sql
   ```

   You can also open `database/relief_db.sql` in MySQL Workbench and run it.
   (If you skip this step the server creates the database and tables itself on first start.)

2. **Configure the connection.** Copy `.env.example` to `.env` and set your MySQL password:

   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=relief_db
   ```

3. **Install and run.**

   ```bash
   npm install
   npm start
   ```

4. Open <http://localhost:3000>.

The indicator in the top bar shows **MySQL · relief_db** (green) when connected. If MySQL is not
reachable the simulation still runs on in-memory data and the indicator turns amber; click it to
retry the connection.

## How data flows

```
Browser (public/)  ──HTTP/JSON──>  Express API (server/server.js)
                                       │
                                       ├── Engine (server/engine.js)
                                       │     hash maps, priority queue, road graph in RAM
                                       │
                                       └── MySQL (server/db.js)  ── relief_db
                                             every change is written in a transaction
                                             before the in-memory state is updated
```

On start-up the server loads all records from MySQL into the in-memory structures. Each action
(new request, restock, allocation step, road change, dispatch, receipt) is written to MySQL in a
single transaction together with an `event_log` entry; the in-memory state only changes after the
commit succeeds.

## Database tables

| Table | Contents |
|---|---|
| `nodes` | Warehouse, junctions and affected areas, with map positions |
| `roads` | Road links, travel time in minutes, `open` / `blocked` |
| `items` | Relief items with `on_hand` and `reserved` quantities |
| `requests` | Area requests: quantity, pending, delivered, urgency, time, status |
| `allocations` | Reservations and their delivery: route, travel time, received quantity |
| `event_log` | Time-stamped record of every action |

Views: `v_inventory` (available stock), `v_priority_queue` (requests in service order),
`v_deliveries` (allocations with shortfall).

Example queries:

```sql
SELECT * FROM v_priority_queue;
SELECT * FROM v_inventory;
SELECT * FROM v_deliveries WHERE shortfall > 0;
```

## API

| Method | Path | Action |
|---|---|---|
| GET | `/api/state` | Full state |
| POST | `/api/requests` | New request |
| PUT / DELETE | `/api/requests/:id` | Update quantity/urgency, or withdraw |
| POST | `/api/items`, `/api/items/:id/restock` | Add item, restock |
| GET | `/api/lookup/:key` | Hash-map lookup trace |
| POST | `/api/allocate/step`, `/api/allocate/run`, `/api/allocate/reset` | Allocation pass |
| GET | `/api/route/:target` | Dijkstra with step trace |
| POST | `/api/roads/:id/toggle` | Block / reopen a road |
| POST | `/api/allocations/:id/dispatch`, `/api/allocations/:id/receive` | Delivery tracking |
| POST | `/api/reset` | Restore the starting scenario |

## Project layout

```
database/
  relief_db.sql        full database: schema, views, starting data
  schema.sql           table definitions used by the server
server/
  server.js            Express app and routes
  engine.js            simulation logic for the three modules
  db.js                MySQL connection, transactions, loading
  seed.js              starting scenario
  structures/          HashMap, PriorityQueue, Graph (Dijkstra)
public/                web interface (HTML, CSS, JavaScript)
scripts/build-sql.js   regenerates database/relief_db.sql from seed.js
```
