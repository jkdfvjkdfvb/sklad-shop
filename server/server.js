const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const ORDERS_FILE   = path.join(DATA_DIR, 'orders.json');

const sessions = new Set();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// --- helpers ---
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
function authMiddleware(req, res, next) {
  if (!sessions.has(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// --- multer ---
const imgStorage = multer.diskStorage({
  destination: path.join(PUBLIC_DIR, 'images'),
  filename: (req, file, cb) => cb(null, req.params.article + path.extname(file.originalname))
});
const vidStorage = multer.diskStorage({
  destination: path.join(PUBLIC_DIR, 'media'),
  filename: (req, file, cb) => cb(null, req.params.article + path.extname(file.originalname))
});
const uploadImg = multer({ storage: imgStorage, limits: { fileSize: 20 * 1024 * 1024 } });
const uploadVid = multer({ storage: vidStorage, limits: { fileSize: 200 * 1024 * 1024 } });

// ==================== Notifications ====================

function orderText(order) {
  const lines = order.items.map(i =>
    `• ${i.name} (Арт. ${i.article}) — ${i.qty} × ${i.price} ₽ = ${i.qty * i.price} ₽`
  );
  return [
    `🛒 Новый заказ #${order.id}`,
    `👤 ${order.customer.name}  📞 ${order.customer.phone}`,
    order.customer.comment ? `💬 ${order.customer.comment}` : '',
    '',
    ...lines,
    '',
    `💰 Итого: ${order.total} ₽`
  ].filter(l => l !== undefined).join('\n');
}

async function sendTelegram(order, contacts) {
  const token = contacts.telegram_bot_token;
  const chatId = contacts.telegram_chat_id;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: orderText(order), parse_mode: 'HTML' })
    });
  } catch (e) { console.error('Telegram error:', e.message); }
}

async function sendEmail(order, contacts) {
  const smtpUser = contacts.smtp_user;
  const smtpPass = contacts.smtp_pass;
  const toEmail  = contacts.order_email || contacts.email;
  if (!smtpUser || !smtpPass || !toEmail) return;
  try {
    const transporter = nodemailer.createTransport({
      host: contacts.smtp_host || 'smtp.gmail.com',
      port: parseInt(contacts.smtp_port) || 587,
      secure: false,
      auth: { user: smtpUser, pass: smtpPass }
    });
    const itemsHtml = order.items.map(i =>
      `<tr><td>${i.article}</td><td>${i.name}</td><td>${i.qty}</td><td>${i.price} ₽</td><td>${i.qty * i.price} ₽</td></tr>`
    ).join('');
    await transporter.sendMail({
      from: `"СкладПромо" <${smtpUser}>`,
      to: toEmail,
      subject: `Новый заказ #${order.id} от ${order.customer.name}`,
      html: `
        <h2>Новый заказ #${order.id}</h2>
        <p><b>Имя:</b> ${order.customer.name}</p>
        <p><b>Телефон:</b> ${order.customer.phone}</p>
        ${order.customer.comment ? `<p><b>Комментарий:</b> ${order.customer.comment}</p>` : ''}
        <table border="1" cellpadding="6" cellspacing="0">
          <tr><th>Артикул</th><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr>
          ${itemsHtml}
          <tr><td colspan="4"><b>Итого</b></td><td><b>${order.total} ₽</b></td></tr>
        </table>`
    });
  } catch (e) { console.error('Email error:', e.message); }
}

// ==================== Public API ====================

app.get('/api/products', (req, res) => {
  res.json(readJSON(PRODUCTS_FILE, []).filter(p => p.visible && p.qty > 0));
});
app.get('/api/contacts', (req, res) => {
  const c = readJSON(CONTACTS_FILE, {});
  // strip sensitive fields from public endpoint
  const { smtp_pass, smtp_user, smtp_host, smtp_port, telegram_bot_token, ...pub } = c;
  res.json(pub);
});

app.post('/api/order', async (req, res) => {
  const { customer, items } = req.body;
  if (!customer?.name || !customer?.phone || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Заполните имя, телефон и добавьте товары в корзину' });
  }
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const order = {
    id: Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    status: 'new',
    customer,
    items,
    total
  };
  const orders = readJSON(ORDERS_FILE, []);
  orders.unshift(order);
  writeJSON(ORDERS_FILE, orders);

  const contacts = readJSON(CONTACTS_FILE, {});
  sendTelegram(order, contacts).catch(() => {});
  sendEmail(order, contacts).catch(() => {});

  res.json({ ok: true, orderId: order.id });
});

// ==================== Auth ====================

app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
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

// ==================== Admin: Products ====================

app.get('/api/admin/products', authMiddleware, (req, res) => res.json(readJSON(PRODUCTS_FILE, [])));

function deleteProductFiles(p) {
  for (const rel of [p.image, p.video]) {
    if (!rel) continue;
    fs.unlink(path.join(PUBLIC_DIR, rel), () => {});
  }
}

app.put('/api/admin/products/bulk', authMiddleware, (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Некорректные данные' });
  const products = readJSON(PRODUCTS_FILE, []);
  for (const item of items) {
    const idx = products.findIndex(p => p.article === item.article);
    if (idx === -1) continue;
    if (item.qty     !== undefined) products[idx].qty     = parseInt(item.qty, 10);
    if (item.price   !== undefined) products[idx].price   = parseInt(item.price, 10);
    if (item.visible !== undefined) products[idx].visible = Boolean(item.visible);
  }
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true });
});

app.post('/api/admin/products/bulk-delete', authMiddleware, (req, res) => {
  const { articles } = req.body;
  if (!Array.isArray(articles) || !articles.length) return res.status(400).json({ error: 'Не выбраны товары' });
  const products = readJSON(PRODUCTS_FILE, []);
  const toRemove  = products.filter(p => articles.includes(p.article));
  const remaining = products.filter(p => !articles.includes(p.article));
  writeJSON(PRODUCTS_FILE, remaining);
  toRemove.forEach(deleteProductFiles);
  res.json({ ok: true, deleted: toRemove.length });
});

app.put('/api/admin/products/:article', authMiddleware, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });
  const { qty, price, visible, video, name, description, category, material, color } = req.body;
  if (qty         !== undefined) products[idx].qty         = parseInt(qty, 10);
  if (price       !== undefined) products[idx].price       = parseInt(price, 10);
  if (visible     !== undefined) products[idx].visible     = Boolean(visible);
  if (video       !== undefined) products[idx].video       = video;
  if (name        !== undefined) products[idx].name        = name;
  if (description !== undefined) products[idx].description = description;
  if (category     !== undefined) products[idx].category    = category;
  if (material     !== undefined) products[idx].material    = material;
  if (color        !== undefined) products[idx].color       = color;
  writeJSON(PRODUCTS_FILE, products);
  res.json(products[idx]);
});

app.delete('/api/admin/products/:article', authMiddleware, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });
  const [removed] = products.splice(idx, 1);
  writeJSON(PRODUCTS_FILE, products);
  deleteProductFiles(removed);
  res.json({ ok: true });
});

app.post('/api/admin/products/:article/duplicate', authMiddleware, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const source = products.find(p => p.article === req.params.article);
  if (!source) return res.status(404).json({ error: 'Товар не найден' });

  let newArticle = `${source.article}-copy`;
  let n = 2;
  while (products.some(p => p.article === newArticle)) {
    newArticle = `${source.article}-copy${n++}`;
  }

  const copy = { ...source, article: newArticle };

  for (const field of ['image', 'video']) {
    if (!source[field]) continue;
    const dir = field === 'image' ? 'images' : 'media';
    const ext = path.extname(source[field]);
    const destRel = `${dir}/${newArticle}${ext}`;
    try {
      fs.copyFileSync(path.join(PUBLIC_DIR, source[field]), path.join(PUBLIC_DIR, destRel));
      copy[field] = destRel;
    } catch { copy[field] = ''; }
  }

  products.push(copy);
  writeJSON(PRODUCTS_FILE, products);
  res.json(copy);
});

app.post('/api/admin/products/:article/image', authMiddleware, uploadImg.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  const products = readJSON(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });
  products[idx].image = `images/${req.params.article}${path.extname(req.file.filename)}`;
  writeJSON(PRODUCTS_FILE, products);
  res.json({ image: products[idx].image });
});

app.post('/api/admin/products/:article/video', authMiddleware, uploadVid.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  const products = readJSON(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });
  products[idx].video = `media/${req.params.article}${path.extname(req.file.filename)}`;
  writeJSON(PRODUCTS_FILE, products);
  res.json({ video: products[idx].video });
});

// ==================== Admin: Orders ====================

app.get('/api/admin/orders', authMiddleware, (req, res) => res.json(readJSON(ORDERS_FILE, [])));

app.put('/api/admin/orders/:id', authMiddleware, (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Заказ не найден' });
  if (req.body.status) orders[idx].status = req.body.status;
  writeJSON(ORDERS_FILE, orders);
  res.json(orders[idx]);
});

// ==================== Admin: Contacts ====================

app.get('/api/admin/contacts', authMiddleware, (req, res) => res.json(readJSON(CONTACTS_FILE, {})));

app.put('/api/admin/contacts', authMiddleware, (req, res) => {
  const allowed = ['phone','email','max','telegram','vk',
                   'order_email','smtp_host','smtp_port','smtp_user','smtp_pass',
                   'telegram_bot_token','telegram_chat_id',
                   'hero_title','hero_text'];
  const contacts = readJSON(CONTACTS_FILE, {});
  for (const key of allowed) {
    if (req.body[key] !== undefined) contacts[key] = req.body[key];
  }
  writeJSON(CONTACTS_FILE, contacts);
  res.json({ ok: true });
});

// ==================== Start ====================

if (!fs.existsSync(ORDERS_FILE)) writeJSON(ORDERS_FILE, []);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Магазин запущен на порту ${PORT}`);
});
