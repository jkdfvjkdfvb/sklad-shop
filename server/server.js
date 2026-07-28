const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { createSeoRouter } = require('./seo');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const SEED_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : SEED_DATA_DIR;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const ORDERS_FILE   = path.join(DATA_DIR, 'orders.json');
const DEFAULT_SITE_URL = 'https://skladpromo.ru';
const SITE_URL = String(process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');

// Фото/видео, загруженные через админку, живут на Railway Volume (DATA_DIR),
// а не в public/ — иначе они сбрасывались бы при каждом редеплое (public/
// разворачивается из git). Фиды (Google/Яндекс) и карточки товара продолжают
// ссылаться на /images/... и /media/..., эти пути теперь обслуживаются отсюда.
const UPLOADS_DIR       = path.join(DATA_DIR, 'uploads');
const UPLOAD_IMAGES_DIR = path.join(UPLOADS_DIR, 'images');
const UPLOAD_MEDIA_DIR  = path.join(UPLOADS_DIR, 'media');

const sessions = new Set();

app.set('trust proxy', 1);
app.use(express.json());
app.use((req, res, next) => {
  const forwardedProtocol = req.get('x-forwarded-proto');
  if (forwardedProtocol && forwardedProtocol.split(',')[0].trim() !== 'https') {
    return res.redirect(301, `${SITE_URL}${req.originalUrl}`);
  }
  next();
});
app.use(createSeoRouter({ productsFile: PRODUCTS_FILE, publicDir: PUBLIC_DIR, siteUrl: SITE_URL, readJSON, writeJSON, escH }));
// Персистентные загрузки обслуживаются с приоритетом над одноимёнными
// файлами из git (public/images, public/media) — так обновлённое фото
// сразу видно, даже если старая версия осталась закоммиченной в репозитории.
app.use('/images', express.static(UPLOAD_IMAGES_DIR));
app.use('/media',  express.static(UPLOAD_MEDIA_DIR));
app.use(express.static(PUBLIC_DIR, { index: false }));

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
function escH(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Обрезка длинного названия для title по границе слова/запятой (для укладки в ~60 симв.).
function truncate(str, max) {
  str = String(str);
  if (str.length <= max) return str;
  let cut = str.slice(0, max);
  const sep = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf(','));
  if (sep > max * 0.5) cut = cut.slice(0, sep);
  return cut.replace(/[\s,]+$/, '') + '…';
}

// Транслитерация RU→LAT для человекочитаемых URL (ЧПУ).
const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',
  м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',
  щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
};
function slugify(str) {
  return String(str).toLowerCase().split('').map(ch => (ch in TRANSLIT ? TRANSLIT[ch] : ch)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// ЧПУ товара: транслит названия (до 6 слов) + артикул как стабильный идентификатор.
function productSlug(p) {
  if (p.slug) return p.slug;
  const base = slugify(p.name).split('-').filter(Boolean).slice(0, 6).join('-');
  const art  = slugify(p.article) || String(p.article);
  return base ? `${base}-${art}` : art;
}

// --- multer ---
const imgStorage = multer.diskStorage({
  destination: UPLOAD_IMAGES_DIR,
  filename: (req, file, cb) => cb(null, req.params.article + path.extname(file.originalname))
});
const vidStorage = multer.diskStorage({
  destination: UPLOAD_MEDIA_DIR,
  filename: (req, file, cb) => cb(null, req.params.article + path.extname(file.originalname))
});
// Отдельное фото для товарных фидов (напр. с инфографикой) — хранится под
// суффиксом -feed, чтобы не перезаписывать обычное фото товара на странице.
const feedImgStorage = multer.diskStorage({
  destination: UPLOAD_IMAGES_DIR,
  filename: (req, file, cb) => cb(null, req.params.article + '-feed' + path.extname(file.originalname))
});
const uploadImg     = multer({ storage: imgStorage,     limits: { fileSize: 20 * 1024 * 1024 } });
const uploadVid     = multer({ storage: vidStorage,     limits: { fileSize: 200 * 1024 * 1024 } });
const uploadFeedImg = multer({ storage: feedImgStorage, limits: { fileSize: 20 * 1024 * 1024 } });

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
  res.json(readJSON(PRODUCTS_FILE, []).filter(p => p.visible && p.qty > 0)
    .map(p => ({ ...p, slug: productSlug(p) })));
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

app.post('/api/admin/products', authMiddleware, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const now = new Date().toISOString();

  let article = String(req.body?.article || '').trim();
  if (!article) article = `new-${Date.now().toString(36)}`;
  if (products.some(p => p.article === article)) {
    return res.status(409).json({ error: 'Товар с таким артикулом уже существует' });
  }

  const product = {
    article, name: 'Новый товар', description: '',
    qty: 0, price: 0, visible: false,
    stock_qty: 0, stock_updated_at: now,
    wholesale_price_from: 0, retail_price: 0,
    image: '', video: '', video_url: '', image_urls: [], feed_image: '',
    category: '', material: '', color: '',
    meta_title: '', meta_description: '',
    seo_updated_at: now, previous_slugs: [],
  };
  products.push(product);
  writeJSON(PRODUCTS_FILE, products);
  res.status(201).json(product);
});

function deleteProductFiles(p) {
  for (const rel of [p.image, p.video, p.feed_image]) {
    if (!rel) continue;
    fs.unlink(path.join(UPLOADS_DIR, rel), () => {});
  }
}

app.put('/api/admin/products/bulk', authMiddleware, (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Некорректные данные' });
  const products = readJSON(PRODUCTS_FILE, []);
  for (const item of items) {
    const idx = products.findIndex(p => p.article === item.article);
    if (idx === -1) continue;
    const product = products[idx];
    const now = new Date().toISOString();
    if (item.qty !== undefined) {
      product.qty = parseInt(item.qty, 10);
      product.stock_qty = product.qty;
      product.stock_updated_at = now;
    }
    if (item.price !== undefined) {
      product.price = parseInt(item.price, 10);
      product.wholesale_price_from = product.price;
      product.retail_price = product.price * 3;
    }
    if (item.visible !== undefined) product.visible = Boolean(item.visible);
    product.seo_updated_at = now;
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
  const { qty, price, visible, video, name, description, category, material, color, seo_name, slug, target_cluster, new_article } = req.body;
  const now = new Date().toISOString();
  if (new_article !== undefined) {
    const nextArticle = String(new_article).trim();
    if (!nextArticle) return res.status(400).json({ error: 'Артикул не может быть пустым' });
    if (nextArticle !== products[idx].article) {
      if (products.some((p, i) => i !== idx && p.article === nextArticle)) {
        return res.status(409).json({ error: 'Товар с таким артикулом уже существует' });
      }
      products[idx].article = nextArticle;
    }
  }
  if (qty !== undefined) {
    products[idx].qty = parseInt(qty, 10);
    products[idx].stock_qty = products[idx].qty;
    products[idx].stock_updated_at = now;
  }
  if (price !== undefined) {
    products[idx].price = parseInt(price, 10);
    products[idx].wholesale_price_from = products[idx].price;
    products[idx].retail_price = products[idx].price * 3;
  }
  if (visible     !== undefined) products[idx].visible     = Boolean(visible);
  if (video       !== undefined) products[idx].video       = video;
  if (name        !== undefined) products[idx].name        = name;
  if (description !== undefined) products[idx].description = description;
  if (category     !== undefined) products[idx].category    = category;
  if (material     !== undefined) products[idx].material    = material;
  if (color        !== undefined) products[idx].color       = color;
  const { meta_title, meta_description } = req.body;
  if (meta_title       !== undefined) products[idx].meta_title       = meta_title;
  if (meta_description !== undefined) products[idx].meta_description = meta_description;
  if (seo_name !== undefined) products[idx].seo_name = seo_name;
  if (target_cluster !== undefined) products[idx].target_cluster = target_cluster;
  if (slug !== undefined && slug && slug !== products[idx].slug) {
    products[idx].previous_slugs = Array.from(new Set([...(products[idx].previous_slugs || []), products[idx].slug].filter(Boolean)));
    products[idx].slug = slug;
  }
  products[idx].seo_updated_at = now;
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

  const fileFields = [
    ['image',      'images', ''],
    ['video',      'media',  ''],
    ['feed_image', 'images', '-feed'],
  ];
  for (const [field, dir, suffix] of fileFields) {
    if (!source[field]) continue;
    const ext = path.extname(source[field]);
    const destRel = `${dir}/${newArticle}${suffix}${ext}`;
    try {
      fs.copyFileSync(path.join(UPLOADS_DIR, source[field]), path.join(UPLOADS_DIR, destRel));
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
  products[idx].image_urls = [products[idx].image];
  products[idx].seo_updated_at = new Date().toISOString();
  writeJSON(PRODUCTS_FILE, products);
  res.json({ image: products[idx].image });
});

app.post('/api/admin/products/:article/video', authMiddleware, uploadVid.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  const products = readJSON(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });
  products[idx].video = `media/${req.params.article}${path.extname(req.file.filename)}`;
  products[idx].video_url = products[idx].video;
  products[idx].seo_updated_at = new Date().toISOString();
  writeJSON(PRODUCTS_FILE, products);
  res.json({ video: products[idx].video });
});

// Отдельное фото для товарных фидов (Google Merchant / Яндекс.Вебмастер) —
// используется в g:image_link/<picture> вместо обычного фото товара, если
// загружено. Обычная страница товара его не показывает.
app.post('/api/admin/products/:article/feed-image', authMiddleware, uploadFeedImg.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  const products = readJSON(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });
  products[idx].feed_image = `images/${req.file.filename}`;
  products[idx].seo_updated_at = new Date().toISOString();
  writeJSON(PRODUCTS_FILE, products);
  res.json({ feed_image: products[idx].feed_image });
});

app.delete('/api/admin/products/:article/feed-image', authMiddleware, (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const idx = products.findIndex(p => p.article === req.params.article);
  if (idx === -1) return res.status(404).json({ error: 'Товар не найден' });
  if (products[idx].feed_image) fs.unlink(path.join(UPLOADS_DIR, products[idx].feed_image), () => {});
  products[idx].feed_image = '';
  products[idx].seo_updated_at = new Date().toISOString();
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true });
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

// ==================== Admin: статус фидов ====================

app.get('/api/admin/feeds/status', authMiddleware, (req, res) => {
  const visible = readJSON(PRODUCTS_FILE, []).filter(p => p.visible);
  res.json({
    generatedAt: new Date().toISOString(),
    total:   visible.length,
    inStock: visible.filter(p => p.qty > 0).length,
  });
});

// ==================== Start ====================

function ensureDataFile(filename, fallback) {
  const destination = path.join(DATA_DIR, filename);
  if (fs.existsSync(destination)) return;

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const seed = path.join(SEED_DATA_DIR, filename);
  if (destination !== seed && fs.existsSync(seed)) fs.copyFileSync(seed, destination);
  else writeJSON(destination, fallback);
}

// A mounted Railway Volume starts empty: seed it once, then preserve admin changes.
ensureDataFile('products.json', []);
ensureDataFile('contacts.json', {});
ensureDataFile('orders.json', []);

// Сидируем персистентную папку загрузок фото/видео из git-репозитория один раз
// (если она ещё пуста, т.е. volume только что примонтирован) — так уже
// загруженные фотографии товаров сразу доступны, а дальнейшие загрузки через
// админку остаются на volume и переживают редеплой.
function ensureUploadsSeeded(uploadDir, seedDir) {
  fs.mkdirSync(uploadDir, { recursive: true });
  if (!fs.existsSync(seedDir)) return;
  if (fs.readdirSync(uploadDir).length > 0) return; // уже засеяно или есть загрузки админа
  for (const file of fs.readdirSync(seedDir)) {
    fs.copyFileSync(path.join(seedDir, file), path.join(uploadDir, file));
  }
}
ensureUploadsSeeded(UPLOAD_IMAGES_DIR, path.join(PUBLIC_DIR, 'images'));
ensureUploadsSeeded(UPLOAD_MEDIA_DIR,  path.join(PUBLIC_DIR, 'media'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Магазин запущен на порту ${PORT}`);
});
