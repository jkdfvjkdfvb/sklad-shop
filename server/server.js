const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getCategoryMeta, categorySeoName, getCategoryPageData, CATEGORY_PAGES, getTisnenieContent, getNanesenieHub, categoryHasTisnenie, getTopCategoryLinks } = require('./seo-data');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const ORDERS_FILE   = path.join(DATA_DIR, 'orders.json');
const TISNENIE_FILE = path.join(DATA_DIR, 'tisnenie.json');
const PORTFOLIO_DIR = path.join(PUBLIC_DIR, 'images', 'portfolio');
if (!fs.existsSync(PORTFOLIO_DIR)) fs.mkdirSync(PORTFOLIO_DIR, { recursive: true });

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
function escH(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const SITE_NAME = 'СкладПромо';

function siteHeaderHtml(contacts) {
  const phone = contacts.phone || '';
  return `<header class="site-header">
  <div class="header-inner">
    <a href="/" class="logo">Склад<span>Промо</span></a>
    <nav class="header-nav">
      <a href="/nanesenie-logotipa/">Нанесение логотипа</a>
    </nav>
    <div class="header-contacts" style="margin-left:auto">
      <a href="tel:${phone.replace(/\D/g,'')}" class="header-phone">${escH(phone)}</a>
      <div class="messenger-links">
        <a href="${escH(contacts.max||'#')}" class="msg-btn max" target="_blank" rel="noopener" title="MAX">M</a>
        <a href="${escH(contacts.telegram||'#')}" class="msg-btn tg" target="_blank" rel="noopener" title="Telegram">TG</a>
        <a href="${escH(contacts.vk||'#')}" class="msg-btn vk" target="_blank" rel="noopener" title="ВКонтакте">VK</a>
      </div>
      <button class="cart-btn" id="cart-btn" aria-label="Корзина">🛒<span class="cart-badge" id="cart-badge">0</span></button>
    </div>
  </div>
</header>`;
}

// Сквозной блок-баннер для перекрёстных переходов между главной, карточкой
// товара, хабом «Нанесение логотипа» и страницей конкретного способа (тиснение).
function ctaBannerHtml(icon, text, href, label) {
  return `<div class="cta-banner">
    <span class="cta-banner-icon">${icon}</span>
    <span class="cta-banner-text">${escH(text)}</span>
    <a href="${escH(href)}" class="cta-banner-btn">${escH(label)}</a>
  </div>`;
}

// Сквозной блок ссылок на приоритетные категории каталога — используется на
// главной, на хабе «Нанесение логотипа» и на странице «Тиснение», чтобы
// из любого хаба можно было в один клик попасть к товарам.
function catalogLinksBlockHtml(title) {
  const links = getTopCategoryLinks();
  return `<section class="seo-links-section">
  <div class="seo-links-inner">
    <h2 class="seo-links-title">${escH(title)}</h2>
    <div class="seo-links-grid">
      ${links.map(l => `<a href="/catalog/${escH(l.slug)}/">${escH(l.seoName)}</a>`).join('')}
    </div>
  </div>
</section>`;
}

function siteFooterHtml() {
  return `<footer class="site-footer">
  <div class="footer-links">
    <a href="/">Каталог</a>
    <a href="/nanesenie-logotipa/">Нанесение логотипа</a>
    <a href="/nanesenie-logotipa/tisnenie/">Тиснение логотипа</a>
  </div>
  <p>© 2024 СкладПромо. Все права защищены.</p>
</footer>`;
}

function cartAndModalHtml() {
  return `<div class="cart-overlay" id="cart-overlay"></div>
<div class="cart-drawer" id="cart-drawer" aria-label="Корзина">
  <div class="cart-header">
    <span>Корзина</span>
    <button class="cart-close" id="cart-close" aria-label="Закрыть">✕</button>
  </div>
  <div class="cart-items" id="cart-items"><p class="cart-empty">Корзина пуста</p></div>
  <div class="cart-footer" id="cart-footer" style="display:none">
    <div class="cart-total"><span>Итого:</span><span id="cart-total-val">0 ₽</span></div>
    <div class="checkout-form" id="checkout-form">
      <input type="text" id="co-name" placeholder="Ваше имя *" required>
      <input type="tel"  id="co-phone" placeholder="Телефон *" required>
      <textarea id="co-comment" placeholder="Комментарий к заказу"></textarea>
      <button class="order-btn" id="order-btn">Оформить заказ</button>
    </div>
    <div class="order-success" id="order-success">
      <h3>✅ Заказ принят!</h3>
      <p id="order-success-text">Мы свяжемся с вами в ближайшее время.</p>
      <button class="add-to-cart-btn" id="order-new-btn" style="margin-top:12px">Продолжить покупки</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="video-modal" role="dialog" aria-modal="true">
  <div class="modal-box">
    <button class="modal-close" id="modal-close" aria-label="Закрыть">✕</button>
    <video id="modal-video" controls playsinline></video>
  </div>
</div>`;
}

function productPageHtml(product, contacts, siteUrl) {
  const pageUrl  = `${siteUrl}/product/${product.article}`;
  const imageUrl = product.image ? `${siteUrl}/${product.image}` : '';
  const siteName = SITE_NAME;
  const inStock  = product.qty > 0;
  const catMeta  = getCategoryMeta(product.category);
  const catSeoName = categorySeoName(product.category);

  const autoDesc = `${product.name} с логотипом для сотрудников, клиентов и партнёров. Нанесение логотипа, оптовые заказы, доставка по России. Арт. ${product.article}, цена ${product.price} ₽${inStock ? `, в наличии ${product.qty} шт.` : ''}.`;

  const title   = product.meta_title       || `${product.name} с логотипом — купить под нанесение`;
  const metaDesc = product.meta_description || autoDesc;

  const priceValid = new Date(Date.now() + 30 * 24 * 3600000).toISOString().split('T')[0];

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || metaDesc,
    sku: product.article,
    brand: { '@type': 'Brand', name: siteName },
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'RUB',
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: pageUrl,
      priceValidUntil: priceValid,
    },
  };
  if (imageUrl) productLd.image = imageUrl;
  if (catSeoName) productLd.category = catSeoName;

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: `${siteUrl}/` },
  ];
  if (catMeta && catMeta.slug && CATEGORY_PAGES[catMeta.slug]) {
    breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: catMeta.seoName, item: `${siteUrl}/catalog/${catMeta.slug}/` });
  } else {
    breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: 'Каталог', item: `${siteUrl}/` });
  }
  breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: product.name, item: pageUrl });

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  };

  const attrs = [
    product.category && ['Категория', catSeoName],
    product.material && ['Материал',  product.material],
    product.color    && ['Цвет',      product.color],
  ].filter(Boolean);

  const breadcrumbHtml = (catMeta && catMeta.slug && CATEGORY_PAGES[catMeta.slug])
    ? `<a href="/">Главная</a><span class="bc-sep">›</span><a href="/catalog/${escH(catMeta.slug)}/">${escH(catMeta.seoName)}</a><span class="bc-sep">›</span><span>${escH(product.name)}</span>`
    : `<a href="/">Главная</a><span class="bc-sep">›</span><a href="/">Каталог</a><span class="bc-sep">›</span><span>${escH(product.name)}</span>`;

  const techBanner = categoryHasTisnenie(product.category)
    ? ctaBannerHtml('🖋️', 'На этот товар можно нанести тиснение логотипа — коже, кожзаму и экокоже.', '/nanesenie-logotipa/tisnenie/', 'Про тиснение логотипа')
    : ctaBannerHtml('🛠️', 'Наносим логотип на этот товар — гравировка, УФ-печать и другие способы под ваш тираж.', '/nanesenie-logotipa/', 'Способы нанесения логотипа');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escH(title)}</title>
  <meta name="description" content="${escH(metaDesc)}">
  <meta property="og:title"       content="${escH(title)}">
  <meta property="og:description" content="${escH(metaDesc)}">
  <meta property="og:type"        content="product">
  <meta property="og:url"         content="${escH(pageUrl)}">
  <meta property="og:site_name"   content="${escH(siteName)}">
  ${imageUrl ? `<meta property="og:image" content="${escH(imageUrl)}">` : ''}
  <link rel="canonical" href="${escH(pageUrl)}">
  <script type="application/ld+json">${JSON.stringify(productLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/product.css">
</head>
<body>

${siteHeaderHtml(contacts)}

<main class="product-page-main">
  <div class="product-page-wrap">
    <nav class="breadcrumb" aria-label="Навигация">
      ${breadcrumbHtml}
    </nav>

    <article class="product-detail" itemscope itemtype="https://schema.org/Product">
      <div class="product-detail-media">
        ${imageUrl
          ? `<img src="/${escH(product.image)}" alt="${escH(product.name)}" class="product-detail-img" itemprop="image">`
          : '<div class="product-detail-no-img">Нет фото</div>'}
        ${product.video
          ? `<button class="card-video-btn" id="video-btn" data-video="${escH(product.video)}">&#9654; Видео</button>`
          : ''}
      </div>

      <div class="product-detail-info">
        <p class="product-detail-article">Арт. <span itemprop="sku">${escH(product.article)}</span></p>
        <h1 class="product-detail-name" itemprop="name">${escH(product.name)}</h1>
        <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <p class="product-detail-price"><span itemprop="price" content="${product.price}">${product.price}</span> ₽
            <meta itemprop="priceCurrency" content="RUB">
            <link itemprop="availability" href="${inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'}">
          </p>
        </div>
        <p class="product-detail-qty ${inStock ? 'in-stock' : 'out-stock'}">
          ${inStock ? `В наличии: ${product.qty} шт.` : 'Нет в наличии'}
        </p>
        ${product.description ? `<p class="product-detail-desc" itemprop="description">${escH(product.description)}</p>` : ''}
        ${attrs.length ? `
        <table class="product-attrs">
          ${attrs.map(([k,v]) => `<tr><th>${escH(k)}</th><td>${escH(v)}</td></tr>`).join('')}
        </table>` : ''}
        ${inStock ? `<button class="add-to-cart-btn" id="add-btn" data-article="${escH(product.article)}">В корзину</button>` : ''}
        ${techBanner}
        <a href="/" class="back-link">← Вернуться в каталог</a>
      </div>
    </article>
  </div>
</main>

${siteFooterHtml()}

${cartAndModalHtml()}

<script>
window.PRODUCT_DATA = ${JSON.stringify({
  article: product.article,
  name:    product.name,
  price:   product.price,
  qty:     product.qty,
  image:   product.image ? '/' + product.image : '',
})};
</script>
<script src="/js/product.js"></script>
</body>
</html>`;
}

function linkifyTechnique(text) {
  if (/тиснен/i.test(text)) {
    return escH(text).replace(/(Тиснение[^(]*)/i, '<a href="/nanesenie-logotipa/tisnenie/">$1</a>');
  }
  return escH(text);
}

function categoryPageHtml(data, products, contacts, siteUrl) {
  const pageUrl = `${siteUrl}/catalog/${data.slug}/`;
  const title = `${data.seoName} — купить под нанесение`;
  const metaDesc = `${data.seoName} для сотрудников, клиентов и партнёров. Подбор товаров, нанесение логотипа, упаковка, оптовые заказы и доставка. Закажите брендированные сувениры для бизнеса.`;

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: data.seoName,
    description: metaDesc,
    url: pageUrl,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${siteUrl}/product/${p.article}`,
        name: p.name,
      })),
    },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: data.seoName, item: pageUrl },
    ],
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faq.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  const cardsHtml = products.map(p => {
    const inStock = p.qty > 0;
    return `
      <div class="product-card">
        <a href="/product/${escH(p.article)}" class="card-img-link" tabindex="-1" aria-hidden="true">
          <div class="card-img-wrap">
            <img src="/${escH(p.image)}" alt="${escH(p.name)}" loading="lazy">
          </div>
        </a>
        <div class="card-body">
          <span class="card-article">Арт. ${escH(p.article)}</span>
          <a href="/product/${escH(p.article)}" class="card-name">${escH(p.name)}</a>
          <span class="card-price">${p.price} ₽</span>
          <span class="card-qty ${inStock ? 'in-stock' : 'out-stock'}">${inStock ? `В наличии: ${p.qty} шт.` : 'Нет в наличии'}</span>
          ${inStock ? `<button class="add-to-cart-btn" data-article="${escH(p.article)}">В корзину</button>` : ''}
        </div>
      </div>`;
  }).join('');

  const relatedHtml = data.related.length ? `
    <section class="category-related">
      <h2>Смежные категории</h2>
      <div class="related-links">
        ${data.related.map(slug => {
          const rd = getCategoryPageData(slug);
          return rd ? `<a href="/catalog/${escH(slug)}/">${escH(rd.seoName)}</a>` : '';
        }).join('')}
      </div>
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escH(title)}</title>
  <meta name="description" content="${escH(metaDesc)}">
  <meta property="og:title"       content="${escH(title)}">
  <meta property="og:description" content="${escH(metaDesc)}">
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${escH(pageUrl)}">
  <meta property="og:site_name"   content="${escH(SITE_NAME)}">
  <link rel="canonical" href="${escH(pageUrl)}">
  <script type="application/ld+json">${JSON.stringify(itemListLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/product.css">
  <link rel="stylesheet" href="/css/category.css">
</head>
<body>

${siteHeaderHtml(contacts)}

<main class="category-page-main">
  <div class="category-page-wrap">
    <nav class="breadcrumb" aria-label="Навигация">
      <a href="/">Главная</a><span class="bc-sep">›</span>
      <span>${escH(data.seoName)}</span>
    </nav>

    <h1 class="category-h1">${escH(data.seoName)}</h1>
    <p class="category-intro">${escH(data.intro)}</p>

    ${data.tasks.length ? `
    <section class="category-tasks">
      <h2>Для каких задач подходит</h2>
      <ul>${data.tasks.map(t => `<li>${escH(t)}</li>`).join('')}</ul>
    </section>` : ''}

    <section class="category-grid-section">
      <h2>Товары в наличии</h2>
      ${products.length ? `<div class="products-grid">${cardsHtml}</div>` : '<p class="status-msg">Товары временно отсутствуют, уточните наличие у менеджера.</p>'}
    </section>

    ${data.techniques.length ? `
    <section class="category-techniques">
      <h2>Способы нанесения логотипа</h2>
      <ul>${data.techniques.map(t => `<li>${linkifyTechnique(t)}</li>`).join('')}</ul>
    </section>` : ''}

    ${ctaBannerHtml('🛠️', 'Хотите узнать подробнее о технологиях брендирования?', '/nanesenie-logotipa/', 'Все способы нанесения логотипа')}

    <section class="category-faq">
      <h2>Частые вопросы</h2>
      ${data.faq.map(([q, a]) => `
        <details class="faq-item">
          <summary>${escH(q)}</summary>
          <p>${escH(a)}</p>
        </details>`).join('')}
    </section>

    ${relatedHtml}

    <a href="/" class="back-link">← Весь каталог</a>
  </div>
</main>

${siteFooterHtml()}

${cartAndModalHtml()}

<script>
window.CATEGORY_PRODUCTS = ${JSON.stringify(products.map(p => ({
  article: p.article, name: p.name, price: p.price, qty: p.qty,
  image: p.image ? '/' + p.image : '',
})))};
</script>
<script src="/js/category.js"></script>
</body>
</html>`;
}

function nanesenieHubHtml(contacts, siteUrl) {
  const hub = getNanesenieHub();
  const pageUrl = `${siteUrl}/nanesenie-logotipa/`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: hub.seoName, item: pageUrl },
    ],
  };

  const cardsHtml = hub.techniques.map(t => `
    <div class="service-type-card">
      <h3>${t.link ? `<a href="${escH(t.link)}">${escH(t.name)}</a>` : escH(t.name)}</h3>
      <p>${escH(t.desc)}</p>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escH(hub.title)}</title>
  <meta name="description" content="${escH(hub.metaDescription)}">
  <meta property="og:title"       content="${escH(hub.title)}">
  <meta property="og:description" content="${escH(hub.metaDescription)}">
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${escH(pageUrl)}">
  <meta property="og:site_name"   content="${escH(SITE_NAME)}">
  <link rel="canonical" href="${escH(pageUrl)}">
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/category.css">
  <link rel="stylesheet" href="/css/service.css">
</head>
<body>

${siteHeaderHtml(contacts)}

<main class="category-page-main">
  <div class="category-page-wrap">
    <nav class="breadcrumb" aria-label="Навигация">
      <a href="/">Главная</a><span class="bc-sep">›</span>
      <span>${escH(hub.seoName)}</span>
    </nav>

    <h1 class="category-h1">${escH(hub.seoName)} на сувенирную и деловую продукцию</h1>
    <p class="category-intro">${escH(hub.intro)}</p>

    <section>
      <h2>Способы нанесения</h2>
      <div class="service-types-grid">${cardsHtml}</div>
    </section>

    <a href="/" class="back-link">← Весь каталог</a>
  </div>
</main>

${catalogLinksBlockHtml('Каталог товаров с нанесением логотипа')}

${siteFooterHtml()}

${cartAndModalHtml()}

<script src="/js/service-page.js"></script>
</body>
</html>`;
}

function tisnenieHtml(tisnenieData, contacts, siteUrl) {
  const page = getTisnenieContent();
  const pageUrl = `${siteUrl}/nanesenie-logotipa/${page.slug}/`;
  const hub = getNanesenieHub();

  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Тиснение логотипа',
    name: page.h1,
    description: page.metaDescription,
    provider: { '@type': 'Organization', name: SITE_NAME },
    areaServed: 'RU',
    url: pageUrl,
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: hub.seoName, item: `${siteUrl}/nanesenie-logotipa/` },
      { '@type': 'ListItem', position: 3, name: page.h1, item: pageUrl },
    ],
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  const portfolio = tisnenieData.portfolio || [];
  const portfolioHtml = portfolio.length
    ? `<div class="portfolio-grid">${portfolio.map(item => `
      <figure class="portfolio-item">
        <img src="/${escH(item.image)}" alt="${escH(item.caption || 'Пример тиснения логотипа')}" loading="lazy">
        ${item.caption ? `<figcaption>${escH(item.caption)}</figcaption>` : ''}
      </figure>`).join('')}</div>`
    : `<p class="status-msg">Портфолио пополняется — примеры выполненных работ можно запросить у менеджера.</p>`;

  const videoHtml = tisnenieData.video
    ? `<div class="service-video-wrap"><video src="/${escH(tisnenieData.video)}" controls playsinline></video></div>`
    : `<p class="status-msg">Видео процесса тиснения появится здесь позже — пока можно запросить его у менеджера.</p>`;

  const relatedHtml = page.related.length ? `
    <section class="category-related">
      <h2>Смежные категории</h2>
      <div class="related-links">
        ${page.related.map(slug => {
          const rd = getCategoryPageData(slug);
          return rd ? `<a href="/catalog/${escH(slug)}/">${escH(rd.seoName)}</a>` : '';
        }).join('')}
        <a href="/nanesenie-logotipa/">Другие способы нанесения логотипа</a>
      </div>
    </section>` : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escH(page.title)}</title>
  <meta name="description" content="${escH(page.metaDescription)}">
  <meta property="og:title"       content="${escH(page.title)}">
  <meta property="og:description" content="${escH(page.metaDescription)}">
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${escH(pageUrl)}">
  <meta property="og:site_name"   content="${escH(SITE_NAME)}">
  <link rel="canonical" href="${escH(pageUrl)}">
  <script type="application/ld+json">${JSON.stringify(serviceLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/category.css">
  <link rel="stylesheet" href="/css/service.css">
</head>
<body>

${siteHeaderHtml(contacts)}

<main class="category-page-main">
  <div class="category-page-wrap">
    <nav class="breadcrumb" aria-label="Навигация">
      <a href="/">Главная</a><span class="bc-sep">›</span>
      <a href="/nanesenie-logotipa/">${escH(hub.seoName)}</a><span class="bc-sep">›</span>
      <span>${escH(page.h1)}</span>
    </nav>

    <h1 class="category-h1">${escH(page.h1)}</h1>
    <p class="category-intro">${escH(page.intro)}</p>

    <section>
      <h2>Виды тиснения</h2>
      <table class="service-table">
        <thead><tr><th>Вид</th><th>Особенности</th></tr></thead>
        <tbody>${page.types.map(([name, desc]) => `<tr><td>${escH(name)}</td><td>${escH(desc)}</td></tr>`).join('')}</tbody>
      </table>
    </section>

    <section class="category-tasks">
      <h2>На каких изделиях делаем тиснение</h2>
      <ul>${page.items.map(t => `<li>${escH(t)}</li>`).join('')}</ul>
    </section>

    <section>
      <h2>Материалы: кожа, кожзам, экокожа</h2>
      <table class="service-table">
        <thead><tr><th>Материал</th><th>Особенности тиснения</th></tr></thead>
        <tbody>${page.materials.map(([name, desc]) => `<tr><td>${escH(name)}</td><td>${escH(desc)}</td></tr>`).join('')}</tbody>
      </table>
    </section>

    <section>
      <h2>Какой вариант выбрать</h2>
      <table class="service-table">
        <thead><tr><th>Задача</th><th>Рекомендуемое тиснение</th></tr></thead>
        <tbody>${page.chooseTable.map(([task, rec]) => `<tr><td>${escH(task)}</td><td>${escH(rec)}</td></tr>`).join('')}</tbody>
      </table>
    </section>

    <section class="portfolio-section">
      <h2>Портфолио выполненных работ</h2>
      ${portfolioHtml}
    </section>

    <section class="video-section">
      <h2>Видео процесса нанесения</h2>
      ${videoHtml}
    </section>

    <section class="category-tasks">
      <h2>От чего зависит стоимость тиснения</h2>
      <ul>${page.costFactors.map(t => `<li>${escH(t)}</li>`).join('')}</ul>
    </section>

    <section class="category-faq">
      <h2>Частые вопросы</h2>
      ${page.faq.map(([q, a]) => `
        <details class="faq-item">
          <summary>${escH(q)}</summary>
          <p>${escH(a)}</p>
        </details>`).join('')}
    </section>

    ${relatedHtml}

    <a href="/" class="back-link">← Весь каталог</a>
  </div>
</main>

${catalogLinksBlockHtml('Каталог товаров с нанесением логотипа')}

${siteFooterHtml()}

${cartAndModalHtml()}

<script src="/js/service-page.js"></script>
</body>
</html>`;
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

const portfolioStorage = multer.diskStorage({
  destination: PORTFOLIO_DIR,
  filename: (req, file, cb) => cb(null, crypto.randomBytes(8).toString('hex') + path.extname(file.originalname))
});
const tisnenieVidStorage = multer.diskStorage({
  destination: path.join(PUBLIC_DIR, 'media'),
  filename: (req, file, cb) => cb(null, 'tisnenie-process' + path.extname(file.originalname))
});
const uploadPortfolioImg  = multer({ storage: portfolioStorage,    limits: { fileSize: 20 * 1024 * 1024 } });
const uploadTisnenieVideo = multer({ storage: tisnenieVidStorage,  limits: { fileSize: 300 * 1024 * 1024 } });

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
  const { meta_title, meta_description } = req.body;
  if (meta_title       !== undefined) products[idx].meta_title       = meta_title;
  if (meta_description !== undefined) products[idx].meta_description = meta_description;
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

// ==================== Admin: Тиснение (портфолио/видео) ====================

const TISNENIE_DEFAULT = { video: '', portfolio: [] };

app.get('/api/admin/tisnenie', authMiddleware, (req, res) => {
  res.json(readJSON(TISNENIE_FILE, TISNENIE_DEFAULT));
});

app.post('/api/admin/tisnenie/video', authMiddleware, uploadTisnenieVideo.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  const data = readJSON(TISNENIE_FILE, TISNENIE_DEFAULT);
  if (data.video) fs.unlink(path.join(PUBLIC_DIR, data.video), () => {});
  data.video = `media/${req.file.filename}`;
  writeJSON(TISNENIE_FILE, data);
  res.json({ video: data.video });
});

app.delete('/api/admin/tisnenie/video', authMiddleware, (req, res) => {
  const data = readJSON(TISNENIE_FILE, TISNENIE_DEFAULT);
  if (data.video) fs.unlink(path.join(PUBLIC_DIR, data.video), () => {});
  data.video = '';
  writeJSON(TISNENIE_FILE, data);
  res.json({ ok: true });
});

app.post('/api/admin/tisnenie/portfolio', authMiddleware, uploadPortfolioImg.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  const data = readJSON(TISNENIE_FILE, TISNENIE_DEFAULT);
  const item = {
    id: path.basename(req.file.filename, path.extname(req.file.filename)),
    image: `images/portfolio/${req.file.filename}`,
    caption: (req.body.caption || '').trim(),
  };
  data.portfolio.push(item);
  writeJSON(TISNENIE_FILE, data);
  res.json(item);
});

app.put('/api/admin/tisnenie/portfolio/:id', authMiddleware, (req, res) => {
  const data = readJSON(TISNENIE_FILE, TISNENIE_DEFAULT);
  const item = data.portfolio.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Не найдено' });
  if (req.body.caption !== undefined) item.caption = req.body.caption;
  writeJSON(TISNENIE_FILE, data);
  res.json(item);
});

app.delete('/api/admin/tisnenie/portfolio/:id', authMiddleware, (req, res) => {
  const data = readJSON(TISNENIE_FILE, TISNENIE_DEFAULT);
  const idx = data.portfolio.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
  const [removed] = data.portfolio.splice(idx, 1);
  fs.unlink(path.join(PUBLIC_DIR, removed.image), () => {});
  writeJSON(TISNENIE_FILE, data);
  res.json({ ok: true });
});

// ==================== Product & category pages (SSR) ====================

app.get('/product/:article', (req, res) => {
  const products = readJSON(PRODUCTS_FILE, []);
  const product  = products.find(p => p.article === req.params.article && p.visible);
  if (!product) return res.redirect('/');
  const contacts = readJSON(CONTACTS_FILE, {});
  const siteUrl  = `${req.protocol}://${req.get('host')}`;
  res.send(productPageHtml(product, contacts, siteUrl));
});

app.get('/catalog/:slug', (req, res) => {
  const data = getCategoryPageData(req.params.slug);
  if (!data) return res.redirect('/');
  const products = readJSON(PRODUCTS_FILE, [])
    .filter(p => p.visible && p.qty > 0 && p.category === data.rawCategory);
  const contacts = readJSON(CONTACTS_FILE, {});
  const siteUrl  = `${req.protocol}://${req.get('host')}`;
  res.send(categoryPageHtml(data, products, contacts, siteUrl));
});

app.get('/nanesenie-logotipa', (req, res) => {
  const contacts = readJSON(CONTACTS_FILE, {});
  const siteUrl  = `${req.protocol}://${req.get('host')}`;
  res.send(nanesenieHubHtml(contacts, siteUrl));
});

app.get('/nanesenie-logotipa/tisnenie', (req, res) => {
  const tisnenieData = readJSON(TISNENIE_FILE, TISNENIE_DEFAULT);
  const contacts     = readJSON(CONTACTS_FILE, {});
  const siteUrl      = `${req.protocol}://${req.get('host')}`;
  res.send(tisnenieHtml(tisnenieData, contacts, siteUrl));
});

// ==================== SEO: robots.txt / sitemap.xml ====================

app.get('/robots.txt', (req, res) => {
  const siteUrl = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /admin-help.html
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const siteUrl  = `${req.protocol}://${req.get('host')}`;
  const products = readJSON(PRODUCTS_FILE, []).filter(p => p.visible && p.qty > 0);
  const urls = [
    { loc: `${siteUrl}/`, priority: '1.0' },
    { loc: `${siteUrl}/nanesenie-logotipa/`, priority: '0.7' },
    { loc: `${siteUrl}/nanesenie-logotipa/tisnenie/`, priority: '0.8' },
    ...Object.keys(CATEGORY_PAGES).map(slug => ({ loc: `${siteUrl}/catalog/${slug}/`, priority: '0.8' })),
    ...products.map(p => ({ loc: `${siteUrl}/product/${p.article}`, priority: '0.6' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${escH(u.loc)}</loc><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;
  res.type('application/xml').send(xml);
});

// ==================== Start ====================

if (!fs.existsSync(ORDERS_FILE)) writeJSON(ORDERS_FILE, []);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Магазин запущен на порту ${PORT}`);
});
