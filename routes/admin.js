'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('../lib/store');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kellergalerie2026';
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;
const MAX_FILE = 15 * 1024 * 1024;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Bild-Uploads aus req.files speichern, gibt Web-Pfade je Feldname zurück. */
function saveUploads(req) {
  const byField = {};
  (req.files || []).forEach(f => {
    if (!IMAGE_TYPES.test(f.mimetype) || !f.buffer || !f.buffer.length || f.buffer.length > MAX_FILE) return;
    const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
    const ext = extMap[f.mimetype] || '.jpg';
    const base = store.slugify(path.basename(f.originalname || 'bild', path.extname(f.originalname || ''))).slice(0, 40);
    const name = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${base}${ext}`;
    fs.writeFileSync(path.join(store.UPLOADS_DIR, name), f.buffer);
    (byField[f.field] = byField[f.field] || []).push('/uploads/' + name);
  });
  return byField;
}

function deleteUpload(imgPath) {
  if (imgPath && imgPath.startsWith('/uploads/')) {
    fs.unlink(path.join(store.UPLOADS_DIR, path.basename(imgPath)), () => {});
  }
}

function requireAdmin(req, res) {
  if (req.session && req.session.admin) return true;
  res.redirect('/admin/login');
  return false;
}

module.exports = function registerAdmin(app) {

  // ---------- Auth ----------
  app.get('/admin/login', (req, res) => {
    if (req.session.admin) return res.redirect('/admin');
    res.render('admin/login', { title: 'Admin – Anmelden', error: null });
  });

  app.post('/admin/login', (req, res) => {
    if (safeEqual(req.body.password || '', ADMIN_PASSWORD)) {
      req.session.admin = true;
      return res.redirect('/admin');
    }
    res.status(401).render('admin/login', { title: 'Admin – Anmelden', error: 'Falsches Passwort.' });
  });

  app.post('/admin/logout', (req, res) => {
    res.setSession({});
    res.redirect('/');
  });

  // ---------- Dashboard ----------
  app.get('/admin', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    res.render('admin/dashboard', {
      title: 'Admin',
      counts: {
        exhibitions: c.exhibitions.length,
        publications: c.publications.length,
        team: c.team.length,
        sponsors: c.sponsors.length
      }
    });
  });

  // ---------- Texte / Site ----------
  const SITE_FIELDS = ['siteName', 'orgName', 'metaDescription', 'heroTitle', 'heroSubtitle',
    'heroCredit', 'aboutText', 'aboutHeaderCredit', 'teamMotto', 'quote', 'quoteAuthor',
    'openingHours', 'address', 'email', 'phone', 'facebook', 'zvr', 'sommerbar',
    'publicationsIntro', 'sponsorsIntro'];

  app.get('/admin/texte', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.render('admin/site', { title: 'Texte & Fotos', saved: req.query.ok === '1' });
  });

  app.post('/admin/texte', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    SITE_FIELDS.forEach(f => {
      if (typeof req.body[f] === 'string') c.site[f] = req.body[f].trim();
    });
    const up = saveUploads(req);
    if (up.heroImageFile) { deleteUpload(c.site.heroImage); c.site.heroImage = up.heroImageFile[0]; }
    if (up.logoFile) { deleteUpload(c.site.logo); c.site.logo = up.logoFile[0]; }
    if (up.aboutHeaderImageFile) { deleteUpload(c.site.aboutHeaderImage); c.site.aboutHeaderImage = up.aboutHeaderImageFile[0]; }
    store.save(c);
    res.redirect('/admin/texte?ok=1');
  });

  // ---------- Ausstellungen ----------
  app.get('/admin/ausstellungen', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.render('admin/exhibitions', { title: 'Ausstellungen verwalten', exhibitions: store.get().exhibitions });
  });

  app.get('/admin/ausstellungen/neu', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.render('admin/exhibition-form', {
      title: 'Neue Ausstellung',
      ex: { slug: '', title: '', subtitle: '', date: new Date().toISOString().slice(0, 10), category: '', body: [], images: [], author: '' },
      isNew: true
    });
  });

  function applyExhibitionForm(ex, body) {
    ex.title = (body.title || '').trim();
    ex.subtitle = (body.subtitle || '').trim();
    ex.date = (body.date || '').trim();
    ex.category = (body.category || 'Allgemein').trim() || 'Allgemein';
    ex.author = (body.author || '').trim();
    ex.body = (body.text || '').split(/\r?\n\s*\r?\n/).map(s => s.trim()).filter(Boolean);
  }

  function sortExhibitions(c) {
    c.exhibitions.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  app.post('/admin/ausstellungen/neu', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const ex = { slug: '', title: '', subtitle: '', date: '', category: '', body: [], author: '', images: [] };
    applyExhibitionForm(ex, req.body);
    ex.slug = store.uniqueSlug(store.slugify(ex.title || 'ausstellung'), c.exhibitions.map(e => e.slug));
    ex.images = (saveUploads(req).images) || [];
    c.exhibitions.push(ex);
    sortExhibitions(c);
    store.save(c);
    res.redirect('/admin/ausstellungen/' + ex.slug + '?ok=1');
  });

  app.get('/admin/ausstellungen/:slug', (req, res, next) => {
    if (!requireAdmin(req, res)) return;
    const ex = store.get().exhibitions.find(e => e.slug === req.params.slug);
    if (!ex) return next();
    res.render('admin/exhibition-form', { title: 'Ausstellung bearbeiten', ex, isNew: false, saved: req.query.ok === '1' });
  });

  app.post('/admin/ausstellungen/:slug', (req, res, next) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const ex = c.exhibitions.find(e => e.slug === req.params.slug);
    if (!ex) return next();
    applyExhibitionForm(ex, req.body);
    ex.images = ex.images.concat((saveUploads(req).images) || []);
    sortExhibitions(c);
    store.save(c);
    res.redirect('/admin/ausstellungen/' + ex.slug + '?ok=1');
  });

  app.post('/admin/ausstellungen/:slug/loeschen', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const ex = c.exhibitions.find(e => e.slug === req.params.slug);
    if (ex) {
      ex.images.forEach(deleteUpload);
      c.exhibitions = c.exhibitions.filter(e => e.slug !== req.params.slug);
      store.save(c);
    }
    res.redirect('/admin/ausstellungen');
  });

  app.post('/admin/ausstellungen/:slug/bild', (req, res, next) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const ex = c.exhibitions.find(e => e.slug === req.params.slug);
    if (!ex) return next();
    const i = parseInt(req.body.index, 10);
    if (Number.isInteger(i) && i >= 0 && i < ex.images.length) {
      if (req.body.action === 'delete') {
        deleteUpload(ex.images[i]);
        ex.images.splice(i, 1);
      } else if (req.body.action === 'up' && i > 0) {
        [ex.images[i - 1], ex.images[i]] = [ex.images[i], ex.images[i - 1]];
      } else if (req.body.action === 'cover') {
        const [img] = ex.images.splice(i, 1);
        ex.images.unshift(img);
      }
      store.save(c);
    }
    res.redirect('/admin/ausstellungen/' + ex.slug);
  });

  // ---------- Publikationen ----------
  app.get('/admin/publikationen', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.render('admin/publications', { title: 'Publikationen verwalten', publications: store.get().publications });
  });

  app.get('/admin/publikationen/neu', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.render('admin/publication-form', {
      title: 'Neue Publikation',
      pub: { id: '', title: '', subtitle: '', details: '', year: '', price: '', isbn: '', image: '' },
      isNew: true
    });
  });

  function applyPublicationForm(pub, body) {
    ['title', 'subtitle', 'details', 'year', 'price', 'isbn'].forEach(f => {
      pub[f] = (body[f] || '').trim();
    });
  }

  app.post('/admin/publikationen/neu', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const pub = { id: '', title: '', subtitle: '', details: '', year: '', price: '', isbn: '', image: '' };
    applyPublicationForm(pub, req.body);
    pub.id = store.uniqueSlug(store.slugify(pub.title || 'publikation'), c.publications.map(p => p.id));
    const up = saveUploads(req);
    if (up.image) pub.image = up.image[0];
    c.publications.push(pub);
    store.save(c);
    res.redirect('/admin/publikationen');
  });

  app.get('/admin/publikationen/:id', (req, res, next) => {
    if (!requireAdmin(req, res)) return;
    const pub = store.get().publications.find(p => p.id === req.params.id);
    if (!pub) return next();
    res.render('admin/publication-form', { title: 'Publikation bearbeiten', pub, isNew: false, saved: req.query.ok === '1' });
  });

  app.post('/admin/publikationen/:id', (req, res, next) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const pub = c.publications.find(p => p.id === req.params.id);
    if (!pub) return next();
    applyPublicationForm(pub, req.body);
    const up = saveUploads(req);
    if (up.image) { deleteUpload(pub.image); pub.image = up.image[0]; }
    store.save(c);
    res.redirect('/admin/publikationen/' + pub.id + '?ok=1');
  });

  app.post('/admin/publikationen/:id/loeschen', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const pub = c.publications.find(p => p.id === req.params.id);
    if (pub) {
      deleteUpload(pub.image);
      c.publications = c.publications.filter(p => p.id !== req.params.id);
      store.save(c);
    }
    res.redirect('/admin/publikationen');
  });

  // ---------- Team & Sponsoren ----------
  app.get('/admin/team', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    res.render('admin/team', { title: 'Team & Sponsoren', team: c.team, sponsors: c.sponsors, saved: req.query.ok === '1' });
  });

  app.post('/admin/team/neu', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const up = saveUploads(req);
    c.team.push({
      id: store.uniqueSlug('team-' + store.slugify(req.body.name || 'mitglied'), c.team.map(t => t.id)),
      name: (req.body.name || '').trim(),
      role: (req.body.role || '').trim(),
      image: up.image ? up.image[0] : ''
    });
    store.save(c);
    res.redirect('/admin/team?ok=1');
  });

  app.post('/admin/team/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const t = c.team.find(x => x.id === req.params.id);
    if (t) {
      if (req.body.action === 'delete') {
        deleteUpload(t.image);
        c.team = c.team.filter(x => x.id !== req.params.id);
      } else {
        t.name = (req.body.name || '').trim();
        t.role = (req.body.role || '').trim();
        const up = saveUploads(req);
        if (up.image) { deleteUpload(t.image); t.image = up.image[0]; }
      }
      store.save(c);
    }
    res.redirect('/admin/team?ok=1');
  });

  app.post('/admin/sponsoren/neu', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const up = saveUploads(req);
    c.sponsors.push({
      id: store.uniqueSlug('sponsor-' + store.slugify(req.body.name || 'neu'), c.sponsors.map(s => s.id)),
      name: (req.body.name || '').trim(),
      url: (req.body.url || '').trim(),
      image: up.image ? up.image[0] : ''
    });
    store.save(c);
    res.redirect('/admin/team?ok=1');
  });

  app.post('/admin/sponsoren/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const c = store.get();
    const s = c.sponsors.find(x => x.id === req.params.id);
    if (s) {
      if (req.body.action === 'delete') {
        deleteUpload(s.image);
        c.sponsors = c.sponsors.filter(x => x.id !== req.params.id);
      } else {
        s.name = (req.body.name || '').trim();
        s.url = (req.body.url || '').trim();
        const up = saveUploads(req);
        if (up.image) { deleteUpload(s.image); s.image = up.image[0]; }
      }
      store.save(c);
    }
    res.redirect('/admin/team?ok=1');
  });
};
