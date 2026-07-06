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

// ---------- SEO: Basis-URL, sitemap.xml & robots.txt ----------
const BASE_URL = (process.env.BASE_URL || 'https://map-kellergalerie-production.up.railway.app').replace(/\/+$/, '');
const prevLocals = app.locals;
app.locals = req => Object.assign(prevLocals(req), { baseUrl: BASE_URL });

app.get('/sitemap.xml', (req, res) => {
    const c = store.get();
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: '/', prio: '1.0', lastmod: today, freq: 'weekly' },
      { loc: '/ausstellungen', prio: '0.9', lastmod: today, freq: 'weekly' },
      { loc: '/ueber-uns', prio: '0.7', lastmod: today, freq: 'monthly' },
      { loc: '/publikationen', prio: '0.7', lastmod: today, freq: 'monthly' },
      { loc: '/sponsoren', prio: '0.5', lastmod: today, freq: 'yearly' },
      { loc: '/kontakt', prio: '0.7', lastmod: today, freq: 'monthly' }
        ].concat(c.exhibitions.map(e => ({
              loc: '/ausstellungen/' + encodeURIComponent(e.slug),
              prio: '0.8',
              lastmod: String(e.date || today).slice(0, 10),
              freq: 'monthly'
        })));
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          urls.map(u => '  <url><loc>' + BASE_URL + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod><changefreq>' + u.freq + '</changefreq><priority>' + u.prio + '</priority></url>').join('\n') +
          '\n</urlset>\n';
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.end(xml);
});

app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ' + BASE_URL + '/sitemap.xml\n');
});
