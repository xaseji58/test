// Self-hosted backend with SQLite DB and encrypted app endpoints
// Run with: node selfhosted.js (or add an npm script)

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';

// Encryption shared key base (same as client YacineAPI)
const KEY_BASE = 'c!xZj+N9&G@Ev@vw';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// DB init
const DB_PATH = path.join(__dirname, 'livematch.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  logo TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  logo TEXT DEFAULT '',
  is_hide INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  name TEXT,
  url TEXT NOT NULL,
  url_type INTEGER DEFAULT 3,
  user_agent TEXT DEFAULT '',
  referer TEXT DEFAULT '',
  headers TEXT DEFAULT '{}', -- JSON string
  drm TEXT DEFAULT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  champions TEXT DEFAULT '',
  commentary TEXT DEFAULT '',
  team1_name TEXT NOT NULL,
  team1_logo TEXT DEFAULT '',
  team2_name TEXT NOT NULL,
  team2_logo TEXT DEFAULT '',
  channel TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS event_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  name TEXT,
  url TEXT NOT NULL,
  url_type INTEGER DEFAULT 3,
  user_agent TEXT DEFAULT '',
  referer TEXT DEFAULT '',
  headers TEXT DEFAULT '{}',
  drm TEXT DEFAULT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
`);

// Helpers
function encrypt(data, key) {
  const jsonStr = JSON.stringify(data);
  const dataBytes = Buffer.from(jsonStr, 'utf8');
  const keyBytes = Buffer.from(key, 'utf8');
  const out = Buffer.alloc(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) out[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  return Buffer.from(out).toString('base64');
}

function auth(req, res, next) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token && token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// Health
app.get('/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Admin CRUD (Bearer ADMIN_TOKEN)
// Categories
app.get('/admin/categories', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY id DESC').all();
  res.json(rows);
});

app.post('/admin/categories', auth, (req, res) => {
  const { name, logo } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('INSERT INTO categories (name, logo) VALUES (?, ?)').run(name, logo || '');
  res.json({ id: info.lastInsertRowid });
});

app.put('/admin/categories/:id', auth, (req, res) => {
  const { name, logo } = req.body;
  const id = Number(req.params.id);
  db.prepare('UPDATE categories SET name = COALESCE(?, name), logo = COALESCE(?, logo) WHERE id = ?').run(name, logo, id);
  res.json({ ok: true });
});

app.delete('/admin/categories/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Channels
app.get('/admin/categories/:categoryId/channels', auth, (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const rows = db.prepare('SELECT * FROM channels WHERE category_id = ? ORDER BY priority DESC, id DESC').all(categoryId);
  res.json(rows);
});

app.post('/admin/categories/:categoryId/channels', auth, (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const { name, logo, is_hide, priority } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare('INSERT INTO channels (category_id, name, logo, is_hide, priority) VALUES (?, ?, ?, ?, ?)')
    .run(categoryId, name, logo || '', is_hide ? 1 : 0, priority || 0);
  res.json({ id: info.lastInsertRowid });
});

app.put('/admin/channels/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const { name, logo, is_hide, priority } = req.body;
  db.prepare('UPDATE channels SET name = COALESCE(?, name), logo = COALESCE(?, logo), is_hide = COALESCE(?, is_hide), priority = COALESCE(?, priority) WHERE id = ?')
    .run(name, logo, typeof is_hide === 'number' ? is_hide : (is_hide ? 1 : 0), priority, id);
  res.json({ ok: true });
});

app.delete('/admin/channels/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Streams per channel
app.get('/admin/channels/:channelId/streams', auth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const rows = db.prepare('SELECT * FROM streams WHERE channel_id = ? ORDER BY id DESC').all(channelId);
  res.json(rows);
});

app.post('/admin/channels/:channelId/streams', auth, (req, res) => {
  const channelId = Number(req.params.channelId);
  const { name, url, url_type, user_agent, referer, headers, drm } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const info = db.prepare('INSERT INTO streams (channel_id, name, url, url_type, user_agent, referer, headers, drm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(channelId, name || '', url, url_type || 3, user_agent || '', referer || '', headers ? JSON.stringify(headers) : '{}', drm || null);
  res.json({ id: info.lastInsertRowid });
});

app.delete('/admin/streams/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM streams WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Events and event streams
app.get('/admin/events', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY start_time DESC').all();
  res.json(rows);
});

app.post('/admin/events', auth, (req, res) => {
  const { start_time, end_time, champions, commentary, team_1, team_2, channel } = req.body;
  if (!start_time || !end_time || !team_1?.name || !team_2?.name) {
    return res.status(400).json({ error: 'missing required fields' });
  }
  const info = db.prepare('INSERT INTO events (start_time, end_time, champions, commentary, team1_name, team1_logo, team2_name, team2_logo, channel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(start_time, end_time, champions || '', commentary || '', team_1.name, team_1.logo || '', team_2.name, team_2.logo || '', channel || '');
  res.json({ id: info.lastInsertRowid });
});

app.delete('/admin/events/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  db.prepare('DELETE FROM event_streams WHERE event_id = ?').run(id);
  res.json({ ok: true });
});

app.get('/admin/events/:eventId/streams', auth, (req, res) => {
  const eventId = Number(req.params.eventId);
  const rows = db.prepare('SELECT * FROM event_streams WHERE event_id = ? ORDER BY id DESC').all(eventId);
  res.json(rows);
});

app.post('/admin/events/:eventId/streams', auth, (req, res) => {
  const eventId = Number(req.params.eventId);
  const { name, url, url_type, user_agent, referer, headers, drm } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const info = db.prepare('INSERT INTO event_streams (event_id, name, url, url_type, user_agent, referer, headers, drm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(eventId, name || '', url, url_type || 3, user_agent || '', referer || '', headers ? JSON.stringify(headers) : '{}', drm || null);
  res.json({ id: info.lastInsertRowid });
});

// App-facing encrypted endpoints (compatible shape with your Worker)
function sendEncrypted(res, payload) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = KEY_BASE + timestamp;
  const encrypted = encrypt(payload, key);
  res.setHeader('t', timestamp);
  res.type('text/plain');
  return res.send(encrypted);
}

app.get('/api/categories', (req, res) => {
  const rows = db.prepare('SELECT id, name, logo FROM categories ORDER BY id ASC').all();
  sendEncrypted(res, { vt: 0, data: rows.map(r => ({ id: r.id, name: r.name, logo: r.logo || '', child_count: 0 })) });
});

app.get('/api/categories/:id/channels', (req, res) => {
  const categoryId = Number(req.params.id);
  const rows = db.prepare('SELECT id, name, logo, is_hide, priority FROM channels WHERE category_id = ? ORDER BY priority DESC, id ASC').all(categoryId);
  sendEncrypted(res, { data: rows.map(r => ({ id: r.id, name: r.name, logo: r.logo || '', is_hide: r.is_hide || 0, priority: r.priority || 0 })) });
});

app.get('/api/channel/:id', (req, res) => {
  const channelId = Number(req.params.id);
  const rows = db.prepare('SELECT name, url, url_type, user_agent, referer, headers, drm FROM streams WHERE channel_id = ? ORDER BY id ASC').all(channelId);
  const data = rows.map(r => ({
    name: r.name || '',
    url: r.url,
    url_type: r.url_type || 3,
    user_agent: r.user_agent || 'Mozilla/5.0',
    referer: r.referer || '',
    event_channel_id: null,
    headers: safeJSON(r.headers),
    drm: r.drm || null,
  }));
  sendEncrypted(res, { data });
});

app.get('/api/events', (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY start_time ASC').all();
  const data = rows.map(r => ({
    id: r.id,
    start_time: r.start_time,
    end_time: r.end_time,
    champions: r.champions || '',
    commentary: r.commentary || '',
    team_1: { name: r.team1_name, logo: r.team1_logo || '' },
    team_2: { name: r.team2_name, logo: r.team2_logo || '' },
    channel: r.channel || ''
  }));
  sendEncrypted(res, { data });
});

app.get('/api/event/:id', (req, res) => {
  const eventId = Number(req.params.id);
  const rows = db.prepare('SELECT name, url, url_type, user_agent, referer, headers, drm FROM event_streams WHERE event_id = ? ORDER BY id ASC').all(eventId);
  const data = rows.map(r => ({
    name: r.name || '',
    url: r.url,
    url_type: r.url_type || 3,
    user_agent: r.user_agent || 'Mozilla/5.0',
    referer: r.referer || '',
    event_channel_id: eventId,
    headers: safeJSON(r.headers),
    drm: r.drm || null,
  }));
  sendEncrypted(res, { data });
});

function safeJSON(s) {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

app.listen(PORT, () => {
  console.log(`Self-hosted server running on :${PORT}`);
});
