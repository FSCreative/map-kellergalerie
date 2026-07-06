'use strict';
/**
 * Mini-Framework ohne Abhängigkeiten:
 * EJS-kompatibler Template-Renderer, Router, Static Files,
 * Cookie-Sessions (HMAC-signiert), URL-encoded- & Multipart-Parser.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');

// ---------------- Template engine (EJS-Teilmenge) ----------------
const tplCache = new Map();

function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function compile(src) {
  let code = "let __o='';with(locals){\n";
  let last = 0;
  const re = /<%([=-]?)([\s\S]*?)%>/g;
  let m;
  while ((m = re.exec(src))) {
    code += '__o+=' + JSON.stringify(src.slice(last, m.index)) + ';\n';
    const body = m[2];
    if (m[1] === '=') code += '__o+=__esc((' + body + '));\n';
    else if (m[1] === '-') code += '__o+=__raw((' + body + '));\n';
    else code += body + '\n';
    last = re.lastIndex;
  }
  code += '__o+=' + JSON.stringify(src.slice(last)) + ';\n}\nreturn __o;';
  return new Function('locals', '__esc', '__raw', code);
}

function renderFile(file, locals) {
  const abs = path.resolve(file);
  let fn = tplCache.get(abs);
  if (!fn) {
    fn = compile(fs.readFileSync(abs, 'utf8'));
    if (process.env.NODE_ENV === 'production') tplCache.set(abs, fn);
  }
  const dir = path.dirname(abs);
  const scoped = Object.assign({}, locals);
  scoped.include = (rel, extra) =>
    renderFile(path.resolve(dir, rel + (rel.endsWith('.ejs') ? '' : '.ejs')),
      Object.assign({}, locals, extra || {}));
  return fn(scoped, escapeHtml, v => (v === null || v === undefined ? '' : String(v)));
}

// ---------------- Cookies & Session ----------------
const SECRET = process.env.SESSION_SECRET || 'map-kellergalerie-secret';

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function readSession(req) {
  const raw = parseCookies(req).mapsession;
  if (!raw) return {};
  const i = raw.lastIndexOf('.');
  if (i < 0) return {};
  const payload = raw.slice(0, i), mac = raw.slice(i + 1);
  const expected = sign(payload);
  try {
    if (mac.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
      const sess = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!sess.exp || sess.exp > Date.now()) return sess;
    }
  } catch (e) { /* ungültig */ }
  return {};
}

function writeSession(res, sess) {
  let cookie;
  if (sess && Object.keys(sess).length) {
    sess.exp = Date.now() + 12 * 60 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify(sess)).toString('base64url');
    cookie = `mapsession=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`;
  } else {
    cookie = 'mapsession=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  }
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookie) : cookie);
}

// ---------------- Body-Parser ----------------
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('Anfrage zu groß')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = [];
  const delim = Buffer.from('--' + boundary);
  let pos = buffer.indexOf(delim);
  while (pos !== -1) {
    const start = pos + delim.length;
    if (buffer.slice(start, start + 2).toString() === '--') break; // Ende
    const next = buffer.indexOf(delim, start);
    if (next === -1) break;
    // Part: \r\n headers \r\n\r\n body \r\n
    const part = buffer.slice(start + 2, next - 2);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = part.slice(0, headerEnd).toString('utf8');
      const body = part.slice(headerEnd + 4);
      const nameM = /name="([^"]*)"/.exec(headers);
      const fileM = /filename="([^"]*)"/.exec(headers);
      const typeM = /content-type:\s*([^\r\n]+)/i.exec(headers);
      if (nameM) {
        if (fileM && fileM[1]) {
          files.push({
            field: nameM[1],
            originalname: fileM[1],
            mimetype: typeM ? typeM[1].trim() : 'application/octet-stream',
            buffer: body
          });
        } else {
          fields[nameM[1]] = body.toString('utf8');
        }
      }
    }
    pos = next;
  }
  return { fields, files };
}

async function parseRequestBody(req) {
  const ct = req.headers['content-type'] || '';
  if (ct.startsWith('application/x-www-form-urlencoded')) {
    const buf = await readBody(req, 2 * 1024 * 1024);
    req.body = querystring.parse(buf.toString('utf8'));
    req.files = [];
  } else if (ct.startsWith('multipart/form-data')) {
    const bm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
    if (!bm) throw new Error('Boundary fehlt');
    const buf = await readBody(req, 150 * 1024 * 1024);
    const parsed = parseMultipart(buf, (bm[1] || bm[2]).trim());
    req.body = parsed.fields;
    req.files = parsed.files;
  } else {
    req.body = {};
    req.files = [];
  }
}

// ---------------- Static files ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf'
};

function serveStatic(rootDir, urlPath, res) {
  const safe = path.normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  if (safe.includes('..')) return false;
  const file = path.join(rootDir, safe);
  if (!file.startsWith(path.resolve(rootDir))) return false;
  let stat;
  try { stat = fs.statSync(file); } catch (e) { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'public, max-age=604800'
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

// ---------------- Router / App ----------------
function pathToRegex(pattern) {
  const keys = [];
  const rx = pattern.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { regex: new RegExp('^' + rx + '$'), keys };
}

function createApp() {
  const routes = [];
  const statics = []; // {prefix, dir}
  const app = {
    get(p, h) { routes.push(Object.assign({ method: 'GET', handler: h }, pathToRegex(p))); },
    post(p, h) { routes.push(Object.assign({ method: 'POST', handler: h }, pathToRegex(p))); },
    static(prefix, dir) { statics.push({ prefix, dir }); },
    locals: {},
    viewsDir: 'views',

    async handle(req, res) {
      const url = new URL(req.url, 'http://localhost');
      req.path = url.pathname;
      req.query = Object.fromEntries(url.searchParams);
      req.session = readSession(req);
      const originalSession = JSON.stringify(req.session);

      // Response-Helfer
      res.statusCode = 200;
      res.status = c => { res.statusCode = c; return res; };
      res.redirect = loc => {
        if (JSON.stringify(req.session) !== originalSession) writeSession(res, req.session);
        res.writeHead(302, { Location: loc });
        res.end();
      };
      res.json = obj => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(obj));
      };
      res.render = (view, locals) => {
        const base = typeof app.locals === 'function' ? app.locals(req) : app.locals;
        const html = renderFile(path.join(app.viewsDir, view + '.ejs'),
          Object.assign({}, base, locals || {}));
        if (JSON.stringify(req.session) !== originalSession) writeSession(res, req.session);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      };
      res.setSession = s => { req.session = s || {}; writeSession(res, req.session); };

      try {
        // Statische Dateien (nur GET/HEAD)
        if (req.method === 'GET' || req.method === 'HEAD') {
          for (const s of statics) {
            if (req.path.startsWith(s.prefix)) {
              if (serveStatic(s.dir, req.path.slice(s.prefix.length), res)) return;
            }
          }
        }
        // Routen
        let decodedPath;
        try { decodedPath = decodeURIComponent(req.path); } catch (e) { decodedPath = req.path; }
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.regex.exec(decodedPath);
          if (!m) continue;
          req.params = {};
          r.keys.forEach((k, i) => { req.params[k] = m[i + 1]; });
          if (req.method === 'POST') await parseRequestBody(req);
          let handled = true;
          const next = () => { handled = false; };
          await r.handler(req, res, next);
          if (handled) return;
        }
        // 404
        res.status(404).render('404', { title: 'Seite nicht gefunden' });
      } catch (err) {
        console.error('Fehler bei %s %s:', req.method, req.path, err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('Interner Serverfehler');
      }
    }
  };
  return app;
}

module.exports = { createApp, renderFile, escapeHtml };
