'use strict';
const path = require('path');
const http = require('http');
const { createApp } = require('./lib/mini');
const store = require('./lib/store');
const registerAdmin = require('./routes/admin');

store.init();

const app = createApp();
const PORT = process.env.PORT || 3000;

app.viewsDir = path.join(__dirname, 'views');
app.static('/', path.join(__dirname, 'public'));
app.static('/uploads/', store.UPLOADS_DIR);

const MONTHS_DE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function formatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)}. ${MONTHS_DE[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

// Basis-Locals für alle Views
app.locals = req => ({
  site: store.get().site,
  formatDate,
  isAdmin: !!(req.session && req.session.admin),
  currentPath: req.path
});

// ---------- Öffentliche Seiten ----------

app.get('/', (req, res) => {
  const c = store.get();
  res.render('index', { title: null, exhibitions: c.exhibitions.slice(0, 4) });
});

app.get('/ueber-uns', (req, res) => {
  const c = store.get();
  res.render('about', { title: 'Über uns', team: c.team });
});

app.get('/ausstellungen', (req, res) => {
  const c = store.get();
  const categories = [...new Set(
    c.exhibitions.flatMap(e => String(e.category || 'Allgemein').split(',').map(s => s.trim()))
  )].sort((a, b) => a.localeCompare(b, 'de'));
  res.render('exhibitions', { title: 'Ausstellungen', exhibitions: c.exhibitions, categories });
});

app.get('/ausstellungen/:slug', (req, res, next) => {
  const c = store.get();
  const i = c.exhibitions.findIndex(e => e.slug === req.params.slug);
  if (i === -1) return next();
  res.render('exhibition', {
    title: c.exhibitions[i].title,
    ex: c.exhibitions[i],
    newer: c.exhibitions[i - 1] || null,
    older: c.exhibitions[i + 1] || null
  });
});

app.get('/publikationen', (req, res) => {
  res.render('publications', { title: 'Publikationen', publications: store.get().publications });
});

app.get('/sponsoren', (req, res) => {
  res.render('sponsors', { title: 'Sponsoren', sponsors: store.get().sponsors });
});

app.get('/kontakt', (req, res) => {
  res.render('contact', { title: 'Kontakt' });
});

app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- Admin ----------
registerAdmin(app);

http.createServer((req, res) => app.handle(req, res)).listen(PORT, () => {
  console.log(`MAP Kellergalerie läuft auf Port ${PORT}`);
});
