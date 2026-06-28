const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

// In-memory session tokens
const sessions = new Set();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// --- helpers ---
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- multer storage ---
const imgStorage = multer.diskStorage({
  destination: path.join(PUBLIC_DIR, 'images'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, req.params.article + ext);
  }
});
const vidStorage = multer.diskStorage({
  destination: path.join(PUBLIC_DIR, 'media'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, req.params.article + ext);
  }
});
const uploadImg = multer({ storage: imgStorage, limits: { fileSize: 20 * 1024 * 1024 } });
const uploadVid = multer({ storage: vidStorage, limits: { fileSize: 200 * 1024 * 1024 } });

// ==================== Public API ====================

app.get('/api/products', (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  res.json(products.filter(p => p.visible && p.qty > 0));
});

app.get('/api/contacts', (req, res) => {
  res.json(readJSON(CONTACTS_FILE));
});

// ==================== Auth ====================

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.add(token);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

app.post('/api/logout', authMiddleware, (req, res) => {
  sessions.delete(req.headers['x-admin-token']);
  res.json({ ok: true });
});

// ==================== Admin API ====================

app.get('/api/admin/products', authMiddleware, (req, res) => {
  res.json(readJSON(PRODUCTS_FILE));
});

app.put('/api/admin/products/:article', authMiddleware, (req, res) => {
  const products = readJSON(PRODUCTS_FILE);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });

  const { qty, price, visible, video } = req.body;
  if (qty !== undefined) products[idx].qty = parseInt(qty, 10);
  if (price !== undefined) products[idx].price = parseInt(price, 10);
  if (visible !== undefined) products[idx].visible = Boolean(visible);
  if (video !== undefined) products[idx].video = video;

  writeJSON(PRODUCTS_FILE, products);
  res.json(products[idx]);
});

app.post('/api/admin/products/:article/image', authMiddleware, uploadImg.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  const products = readJSON(PRODUCTS_FILE);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });

  const ext = path.extname(req.file.filename);
  products[idx].image = `images/${req.params.article}${ext}`;
  writeJSON(PRODUCTS_FILE, products);
  res.json({ image: products[idx].image });
});

app.post('/api/admin/products/:article/video', authMiddleware, uploadVid.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  const products = readJSON(PRODUCTS_FILE);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });

  const ext = path.extname(req.file.filename);
  products[idx].video = `media/${req.params.article}${ext}`;
  writeJSON(PRODUCTS_FILE, products);
  res.json({ video: products[idx].video });
});

app.put('/api/admin/contacts', authMiddleware, (req, res) => {
  const allowed = ['phone', 'email', 'max', 'telegram', 'vk'];
  const contacts = readJSON(CONTACTS_FILE);
  for (const key of allowed) {
    if (req.body[key] !== undefined) contacts[key] = req.body[key];
  }
  writeJSON(CONTACTS_FILE, contacts);
  res.json(contacts);
});

// ==================== Start ====================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Магазин запущен на порту ${PORT}`);
  console.log(`Админка: /admin.html`);
});
