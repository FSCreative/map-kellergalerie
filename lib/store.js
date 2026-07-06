'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data-live');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const SEED_FILE = path.join(ROOT, 'seed', 'content.json');

let cache = null;

function init() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(CONTENT_FILE)) {
    fs.copyFileSync(SEED_FILE, CONTENT_FILE);
    console.log('Seed-Inhalte nach %s kopiert', CONTENT_FILE);
  }
}

function get() {
  if (!cache) {
    cache = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  }
  return cache;
}

function save(content) {
  cache = content;
  const tmp = CONTENT_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(content, null, 1), 'utf8');
  fs.renameSync(tmp, CONTENT_FILE);
}

function slugify(str) {
  return String(str)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'eintrag';
}

function uniqueSlug(base, taken) {
  let slug = base, n = 2;
  while (taken.includes(slug)) slug = base + '-' + n++;
  return slug;
}

module.exports = { init, get, save, slugify, uniqueSlug, DATA_DIR, UPLOADS_DIR };
