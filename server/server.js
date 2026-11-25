'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const { Engine, AppError } = require('./engine');

const app = express();
const engine = new Engine();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Writes run one at a time so the in-memory structures and MySQL stay in step.
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

function handle(fn, { write = true } = {}) {
  return async (req, res) => {
    try {
      const result = write ? await serial(() => fn(req)) : await fn(req);
      res.json({ ok: true, result, state: engine.state() });
    } catch (err) {
      const status = err instanceof AppError ? err.status : 500;
      if (status === 500) console.error(err);
      res.status(status).json({ ok: false, error: err.message });
    }
  };
}

app.get('/healthz', (req, res) => res.send('ok'));
app.get('/api/state', (req, res) => res.json({ ok: true, state: engine.state() }));

// Module 1
app.post('/api/requests', handle((req) => engine.addRequest(req.body)));
app.put('/api/requests/:id', handle((req) => engine.updateRequest(req.params.id, req.body)));
app.delete('/api/requests/:id', handle((req) => engine.deleteRequest(req.params.id)));
app.post('/api/items', handle((req) => engine.addItem(req.body)));
app.post('/api/items/:id/restock', handle((req) => engine.restock(req.params.id, req.body)));
app.get('/api/lookup/:key', handle((req) => engine.lookup(req.params.key), { write: false }));

// Module 2
app.post('/api/allocate/step', handle(() => engine.allocateStep()));
app.post('/api/allocate/run', handle(() => engine.allocateAll()));
app.post('/api/allocate/reset', handle(() => engine.resetQueue()));

// Module 3
app.get('/api/route/:target', handle((req) => engine.route(req.params.target), { write: false }));
app.post('/api/roads/:id/toggle', handle((req) => engine.toggleRoad(req.params.id)));
app.post('/api/allocations/:id/dispatch', handle((req) => engine.dispatch(req.params.id)));
app.post('/api/allocations/:id/receive', handle((req) => engine.receive(req.params.id, req.body)));

// System
app.post('/api/reset', handle(() => engine.reset()));
app.post('/api/db/reconnect', handle(() => engine.reconnect()));

function openBrowser(url) {
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// Use the next free port if the configured one is taken (up to 10 tries).
function listen(port, status, tries = 0) {
  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  Relief Allocation Simulator');
    console.log(`  Open in your browser: ${url}`);
    if (status.connected) console.log(`  MySQL connected: ${status.database} on ${status.host}`);
    else {
      console.log(`  MySQL not connected (${status.error})`);
      console.log('  Running on in-memory data. Set your MySQL details in the .env file to save data.');
    }
    console.log('  Press Ctrl+C to stop.');
    console.log('');
    if (process.env.OPEN_BROWSER === '1') openBrowser(url);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries < 10) listen(port + 1, status, tries + 1);
    else {
      console.error(err.message);
      process.exit(1);
    }
  });
}

engine.init().then((status) => listen(PORT, status));
