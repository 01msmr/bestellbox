import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDb, createLogic, HttpError } from './db.js';
import { securityHeaders } from './security.js';
import { LIMITS, TIMING } from './public/config.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function createApp({ dbFile = ':memory:', admins = [], frameAncestors = [] } = {}) {
  const headers = securityHeaders(frameAncestors);
  const db = openDb(dbFile);
  const logic = createLogic(db, { admins });
  const clients = new Set();

  const emit = (roundId) => {
    const msg = `data: ${JSON.stringify({ type: 'change', roundId: roundId ?? null })}\n\n`;
    for (const res of clients) res.write(msg);
  };

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, TIMING.sseHeartbeatMs);
  heartbeat.unref();

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > LIMITS.requestBodyBytes) throw new HttpError(413, 'Zu groß');
      chunks.push(c);
    }
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'Ungültiges JSON');
    }
  }

  const viewerOf = (req) => {
    const raw = req.headers['x-user'];
    if (!raw) return '';
    try {
      return decodeURIComponent(String(raw)).trim().slice(0, LIMITS.userName);
    } catch {
      return '';
    }
  };

  const send = (res, status, body) => {
    const data = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(data);
  };

  async function api(req, res, url) {
    const user = viewerOf(req);
    const method = req.method;
    const p = url.pathname;
    let m;

    if (method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`retry: ${TIMING.sseRetryMs}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (method === 'GET' && p === '/api/me') return send(res, 200, { user, is_admin: user ? logic.isAdmin(user) : false });
    if (method === 'GET' && p === '/api/me/paypal') return send(res, 200, { paypal: logic.myPaypal(user) });
    if (method === 'GET' && p === '/api/export') {
      if (!user || !logic.isAdmin(user)) return send(res, 403, { error: 'Nur für Admins' });
      return send(res, 200, logic.exportRows());
    }
    if (method === 'GET' && p === '/api/users') return send(res, 200, logic.users());
    if (method === 'GET' && p === '/api/restaurants') return send(res, 200, logic.restaurants());
    if (method === 'GET' && p === '/api/stats') return send(res, 200, logic.stats(url.searchParams.get('scope') === 'last30' ? 'last30' : 'all'));
    if (method === 'GET' && p === '/api/rounds') return send(res, 200, logic.listRounds(user, url.searchParams.has('all') ? -1 : undefined));
    if (method === 'POST' && p === '/api/rounds') {
      const id = logic.createRound(user, await readJson(req));
      emit(id);
      return send(res, 201, { id });
    }
    if ((m = p.match(/^\/api\/rounds\/(\d+)$/))) {
      if (method === 'GET') return send(res, 200, logic.roundDetail(m[1], user));
      if (method === 'PATCH') {
        logic.updateRound(user, m[1], await readJson(req));
        emit(m[1]);
        return send(res, 200, logic.roundDetail(m[1], user));
      }
    }
    if (method === 'POST' && (m = p.match(/^\/api\/rounds\/(\d+)\/time$/))) {
      logic.changeTime(user, m[1], await readJson(req));
      emit(m[1]);
      return send(res, 200, logic.roundDetail(m[1], user));
    }
    if (method === 'GET' && (m = p.match(/^\/api\/rounds\/(\d+)\/catalog$/))) return send(res, 200, logic.catalog(m[1]));
    if (method === 'POST' && (m = p.match(/^\/api\/rounds\/(\d+)\/items$/))) {
      let id;
      try {
        id = logic.addItem(user, m[1], await readJson(req));
      } catch (e) {
        if (e instanceof HttpError && e.status === 403) emit(m[1]); // neue Freigabe-Anfrage live anzeigen
        throw e;
      }
      emit(m[1]);
      return send(res, 201, { id });
    }
    if (method === 'POST' && (m = p.match(/^\/api\/rounds\/(\d+)\/(done|paid)$/))) {
      try {
        logic.setFlag(user, m[1], m[2], await readJson(req));
      } catch (e) {
        if (e instanceof HttpError && e.status === 403) emit(m[1]);
        throw e;
      }
      emit(m[1]);
      return send(res, 200, logic.roundDetail(m[1], user));
    }
    if ((m = p.match(/^\/api\/items\/(\d+)$/))) {
      if (method === 'PATCH') {
        const rid = logic.updateItem(user, m[1], await readJson(req));
        emit(rid);
        return send(res, 200, { ok: true });
      }
      if (method === 'DELETE') {
        const rid = logic.deleteItem(user, m[1]);
        emit(rid);
        return send(res, 200, { ok: true });
      }
    }
    throw new HttpError(404, 'Nicht gefunden');
  }

  const startVersion = String(Date.now());

  async function serveStatic(res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) throw new HttpError(404, 'Nicht gefunden');
    try {
      let data = await readFile(file);
      if (path.basename(file) === 'index.html') data = Buffer.from(data.toString('utf8').replaceAll('__VERSION__', startVersion)); // Cache-Version = Startzeit des Servers
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    } catch {
      throw new HttpError(404, 'Nicht gefunden');
    }
  }

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(res, url.pathname);
      else throw new HttpError(405, 'Methode nicht erlaubt');
    } catch (err) {
      if (res.headersSent) return res.end();
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      send(res, status, { error: err instanceof HttpError ? err.message : 'Interner Fehler' });
    }
  });

  server.on('close', () => {
    clearInterval(heartbeat);
    for (const res of clients) res.end();
    db.close();
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  const admins = (process.env.ADMINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const frameAncestors = (process.env.FRAME_ANCESTORS ?? '').split(/[\s,]+/).filter(Boolean);
  const dbFile = process.env.DB_FILE ?? './data/dinedeck.db';
  if (dbFile !== ':memory:') mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
  const server = createApp({ dbFile, admins, frameAncestors });
  server.listen(port, host, () => console.log(`dinedeck läuft auf http://${host}:${port}`));
  const stop = () => {
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
