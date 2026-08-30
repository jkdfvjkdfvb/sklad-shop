'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

function createSeoRouter({ productsFile, publicDir, siteUrl, readJSON, writeJSON, escH }) {
  const router = express.Router();
  const cleanSiteUrl = String(siteUrl).replace(/\/$/, '');

  const productName = p => p.seo_name || p.name || `Товар ${p.article}`;
  const productSlug = p => p.slug || slugify(`${productName(p)}-${p.article}`);
  const productUrl = p => `${cleanSiteUrl}/product/${encodeURIComponent(productSlug(p))}`;
  const categoryUrl = slug => `${cleanSiteUrl}/category/${encodeURIComponent(slug)}`;
  const assetUrl = file => file ? `${cleanSiteUrl}/${String(file).replace(/^\//, '')}` : '';
  const quantity = p => Number.isFinite(Number(p.stock_qty)) ? Number(p.stock_qty) : Number(p.qty) || 0;
  // Цена = ровно то значение, которое задано в админке — без наценки.
  const retailPrice = p => Number(p.price) || 0;
  const inStock = p => quantity(p) > 0;
  const priceText = value => Number(value).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
  const jsonForScript = value => JSON.stringify(value).replace(/</g, '\\u003c');

  function slugify(value) {
    const map = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
    return String(value).toLowerCase().split('').map(char => map[char] ?? char).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function formatStockDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : '';
  }

  // <time datetime> с машиночитаемой датой рядом с человекочитаемой — тот же
  // текст, что и раньше, просто не голый string в разметке.
  function stockUpdatedTimeHtml(product) {
    const date = product.stock_updated_at ? new Date(product.stock_updated_at) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    const human = formatStockDate(product.stock_updated_at);
    return `<time datetime="${date.toISOString().slice(0, 10)}">${escH(human)}</time>`;
  }

  function lastmod(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
  }

  // Страница — это данные плюс шаблон, а даты в товарах отвечают только за
  // данные. 30.08.2026 разметка была переписана целиком (SSR-каталог, schema,
  // семантика карточки), но остатки не трогались с 17.07.2026 — и все 91 URL
  // ушли в sitemap с июльской датой. Google скачал его и прочитал «с июля
  // ничего не менялось»: сигнал НЕ переобходить, ровно обратный нужному.
  //
  // Дату правим руками и только когда меняется то, что видит робот. Ставить
  // сюда время выкатки нельзя: lastmod обновлялся бы на каждом деплое, включая
  // правки, невидимые на странице, — это и есть тот искусственный lastmod,
  // которому поисковики со временем перестают верить.
  const TEMPLATE_CHANGED_AT = '2026-08-30';
  // Обе даты в формате YYYY-MM-DD, поэтому сравнение строк здесь корректно.
  const pageChanged = dataDate =>
    (dataDate && dataDate > TEMPLATE_CHANGED_AT ? dataDate : TEMPLATE_CHANGED_AT);

  function validUrl(value, disallowed = []) {
    if (!value) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || disallowed.some(part => url.href.includes(part))) return '';
      return url.href;
    } catch { return ''; }
  }

  function validPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 10 && !/^7?0+$/.test(digits) ? String(value).trim() : '';
  }

  function validEmail(value) {
    const email = String(value || '').trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/@example\.com$/i.test(email) ? email : '';
  }

  function socialIcon(name) {
    const icons = {"max":"<img class=\"max-logo\" src=\"/icons/max-logo-black.svg\" alt=\"\">","tg":"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m20.5 4.2-3 15.1c-.2 1.1-1 1.4-1.9.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.3L5.1 12.8.4 11.3c-1-.3-1-1 .2-1.5L19 2.7c.9-.3 1.7.2 1.5 1.5Z\"/></svg>","vk":"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M4 7.2h2.9c.2 4.1 2.1 6.6 3.6 7.1V7.2h2.7v4.1c1.5-.2 3-2.5 3.6-4.1h2.7c-.5 2-2.2 4.4-3.4 5.4 1.2.8 3.1 2.9 3.8 5.2h-3c-.7-1.6-2-3.5-3.7-3.7v3.7h-.3C7.8 17.8 4.7 14.3 4 7.2Z\"/></svg>"};
    return icons[name] || '';
  }

  function socialLinksFor(contacts = {}) {
    return [
      ['max', 'MAX', validUrl(contacts.max, ['max.ru/'])],
      ['tg', 'Telegram', validUrl(contacts.telegram, ['t.me/username'])],
      ['vk', 'ВКонтакте', validUrl(contacts.vk, ['vk.com/username'])],
    ].filter(([, , url]) => url);
  }

  function socialLinksHtml(links, className) {
    if (!links.length) return '';
    return `<div class="${className}">${links.map(([name, label, url]) => `<a href="${escH(url)}" class="msg-btn ${name}" target="_blank" rel="noopener" title="${escH(label)}" aria-label="${escH(label)}">${socialIcon(name)}<span class="visually-hidden">${escH(label)}</span></a>`).join('')}</div>`;
  }

  // Счётчики подключаются только при заданных ID в переменных окружения.
  // Пустой ID — ничего не рендерится: счётчик-заглушка хуже отсутствующего,
  // он создаёт видимость измерения там, где его нет.
  const GA4_ID = String(process.env.GA4_ID || '').trim();
  const YM_ID = String(process.env.YANDEX_METRIKA_ID || '').trim();

  function analyticsHtml() {
    if (!GA4_ID && !YM_ID) return '';
    const ga = GA4_ID ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${escH(GA4_ID)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${JSON.stringify(GA4_ID)});</script>` : '';
    const ym = YM_ID ? `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');ym(${JSON.stringify(YM_ID)},'init',{defer:true,clickmap:true,trackLinks:true,accurateTrackBounce:true});</script><noscript><div><img src="https://mc.yandex.ru/watch/${escH(YM_ID)}" style="position:absolute;left:-9999px" alt=""></div></noscript>` : '';
    // Единая точка отправки событий. Вызывается как window.skladTrack?.(...) —
    // если счётчиков нет, вызов просто не происходит и код не падает.
    const shim = `<script>window.skladTrack=function(name,params){params=params||{};try{if(window.gtag)gtag('event',name,params);if(window.ym)ym(${JSON.stringify(YM_ID || '0')},'reachGoal',name,params);}catch(e){}};</script>`;
    return ga + ym + shim;
  }

  function footerHtml(contacts = {}) {
    // Год берётся из системного времени, а не зашит: в footer он устаревал
    // молча — «2024» провисел до августа 2026-го.
    return `<footer class="site-footer"><p>© ${new Date().getFullYear()} СкладПромо. Все права защищены.</p></footer>`;
  }
  function headerHtml(contacts = {}) {
    const phone = validPhone(contacts.phone);
    const socialLinks = socialLinksFor(contacts);
    return `<header class="site-header">
  <div class="header-inner">
    <a href="/" class="logo">Склад<span>Промо</span></a>
    <div class="header-contacts" style="margin-left:auto">
      ${phone ? `<a href="tel:+${escH(phone.replace(/\D/g, ''))}" class="header-phone">${escH(phone)}</a>` : ''}
      ${socialLinksHtml(socialLinks, 'messenger-links')}
      <button class="cart-btn" id="cart-btn" aria-label="Корзина">🛒<span class="cart-badge" id="cart-badge">0</span></button>
    </div>
  </div>
</header>`;
  }

  function isValidSale(product) {
    const current = retailPrice(product);
    const old = Number(product.old_price);
    const discount = Number(product.discount_percent);
    if (!product.is_sale || !old || old <= current || !discount || discount <= 0) return false;
    if (!product.sale_terms && !product.sale_start_at && !product.sale_end_at) return false;
    const now = Date.now();
    if (product.sale_start_at && new Date(product.sale_start_at).getTime() > now) return false;
    if (product.sale_end_at && new Date(product.sale_end_at).getTime() < now) return false;
    return true;
  }

  function descriptionFor(product) {
    const name = productName(product);
    const stock = quantity(product);
    const retail = priceText(retailPrice(product));
    if (stock <= 0) return `${name}. Арт. ${product.article}. Нет в наличии. Цена ${retail} ₽. Опт — по запросу.`;
    // Единственный источник — шаблон: цена и остаток подставляются в момент
    // рендера из тех же полей, что и видимый блок цены. Снимок
    // meta_description больше не хранится — он устаревал при первом же
    // изменении прайса (все 69 значений разъехались с ценой ровно в 3 раза).
    const template = product.meta_description_template;
    if (template && template.includes('{{stock_qty}}') && template.includes('{{retail_price}}')) {
      return template.replaceAll('{{stock_qty}}', String(stock)).replaceAll('{{retail_price}}', retail);
    }
    return `${name}. Арт. ${product.article}. В наличии на складе: ${stock} шт. Цена ${retail} ₽. Опт — по запросу.`;
  }

  function titleFor(product) {
    const candidate = product.meta_title || `${product.short_name || productName(product)} — купить | СкладПромо`;
    return candidate.replace(/(?:\.\.\.|…)/g, '');
  }

  function characteristics(product) {
    return [
      ['Артикул', product.article],
      ['Категория', product.category_name || product.category],
      ['Материал', product.material],
      ['Цвет', product.color],
      ['Размеры', product.dimensions_mm ? `${product.dimensions_mm} мм` : ''],
      ['Вес', product.weight_g ? `${product.weight_g} г` : ''],
      ['Комплектация', product.package_contents],
      ['Совместимость', product.compatibility],
    ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  }

  function factsHtml(product) {
    const stock = quantity(product);
    const updatedHtml = stockUpdatedTimeHtml(product);
    const stockHtml = stock > 0
      ? `На складе: ${escH(String(stock))} шт.${updatedHtml ? ` (обновлено ${updatedHtml})` : ''}`
      : `Нет в наличии${updatedHtml ? ` (обновлено ${updatedHtml})` : ''}`;
    // Наличие собрано как готовый HTML (несёт <time>), остальные факты —
    // обычный текст; поэтому dd больше не экранирует value поголовно.
    const facts = [
      ['Артикул', escH(product.article)],
      product.material && ['Материал', escH(product.material)],
      product.color && ['Цвет', escH(product.color)],
      ['Наличие', stockHtml],
    ].filter(Boolean);
    return `<section class="product-facts" aria-labelledby="facts-heading">
  <h2 id="facts-heading">Коротко о товаре</h2>
  <dl>${facts.map(([key, value]) => `<div><dt>${escH(key)}</dt><dd>${value}</dd></div>`).join('')}</dl>
</section>`;
  }

  function faqFor(product) {
    const name = productName(product);
    const stock = quantity(product);
    const updated = formatStockDate(product.stock_updated_at);
    const details = characteristics(product).filter(([key]) => key !== 'Артикул')
      .map(([key, value]) => `${key.toLowerCase()} — ${value}`).join('; ');
    const questions = [
      {
        question: `Есть ли ${name} в наличии?`,
        answer: stock > 0
          ? `Да, на складе ${stock} шт.${updated ? ` Остаток обновлён ${updated}.` : ''}`
          : `Сейчас товара нет в наличии.${updated ? ` Остаток обновлён ${updated}.` : ''}`,
      },
      {
        question: `Какие характеристики у ${name}?`,
        answer: details ? `В карточке указаны: ${details}.` : `В карточке указан артикул ${product.article}. Другие характеристики не заполнены.`,
      },
      {
        question: 'Можно ли купить оптом?',
        answer: 'Да, оставьте заявку: менеджер подтвердит цену и условия.',
      },
    ];
    if (product.logo_service_available && product.logo_service_min_qty && product.logo_service_lead_time && Array.isArray(product.logo_service_methods) && product.logo_service_methods.length) {
      questions.push({
        question: 'Можно ли заказать нанесение логотипа?',
        answer: `Да, по запросу через партнёрское производство. Минимальный тираж — ${product.logo_service_min_qty}; срок — ${product.logo_service_lead_time}; доступные способы: ${product.logo_service_methods.join(', ')}.`,
      });
    }
    return questions;
  }

  function faqHtml(faq) {
    return `<section class="product-faq" aria-labelledby="faq-heading">
  <h2 id="faq-heading">Вопросы о товаре</h2>
  <div>${faq.map(item => `<details><summary>${escH(item.question)}</summary><p>${escH(item.answer)}</p></details>`).join('')}</div>
</section>`;
  }

  function productCardHtml(product, { sale = false } = {}) {
    const stock = quantity(product);
    const price = retailPrice(product);
    const image = product.image || (product.image_urls && product.image_urls[0]);
    const saleHtml = sale && isValidSale(product)
      ? `<span class="seo-card-old-price">${priceText(product.old_price)} ₽</span><span class="seo-sale-badge">−${escH(product.discount_percent)}%</span>` : '';
    return `<article class="seo-card">
  <a href="/product/${encodeURIComponent(productSlug(product))}" class="seo-card-image">${image ? `<img src="/${escH(String(image).replace(/^\//, ''))}" alt="${escH(productName(product))}" loading="lazy">` : '<span>Нет фото</span>'}</a>
  <div class="seo-card-body">
    <p>Арт. ${escH(product.article)}</p>
    <h2><a href="/product/${encodeURIComponent(productSlug(product))}">${escH(productName(product))}</a></h2>
    <div class="seo-card-price">${saleHtml}<strong>${priceText(price)} ₽</strong></div>
    <span class="${stock > 0 ? 'in-stock' : 'out-stock'}">${stock > 0 ? `В наличии: ${stock} шт.` : 'Нет в наличии'}</span>
  </div>
</article>`;
  }

  function relatedHtml(product, products) {
    const related = products.filter(candidate => candidate.visible && candidate.article !== product.article && candidate.category_slug === product.category_slug).slice(0, 4);
    if (!related.length) return `<aside class="related-products" aria-labelledby="related-heading"><h2 id="related-heading">Похожие товары</h2><p>В этой категории пока нет других товаров.</p></aside>`;
    return `<aside class="related-products" aria-labelledby="related-heading">
  <h2 id="related-heading">Похожие товары</h2>
  <div class="seo-product-grid">${related.map(item => productCardHtml(item)).join('')}</div>
</aside>`;
  }

  function cartHtml() {
    return `<div class="cart-overlay" id="cart-overlay"></div>
<div class="cart-drawer" id="cart-drawer" aria-label="Корзина">
  <div class="cart-header"><span>Корзина</span><button class="cart-close" id="cart-close" aria-label="Закрыть">✕</button></div>
  <div class="cart-items" id="cart-items"><p class="cart-empty">Корзина пуста</p></div>
  <div class="cart-footer" id="cart-footer" style="display:none">
    <div class="cart-total"><span>Итого:</span><span id="cart-total-val">0 ₽</span></div>
    <div class="checkout-form" id="checkout-form"><label class="visually-hidden" for="co-name">Ваше имя</label><input type="text" id="co-name" placeholder="Ваше имя *" required><label class="visually-hidden" for="co-phone">Телефон</label><input type="tel" id="co-phone" placeholder="+7XXXXXXXXXX" required pattern="\\+7\\d{10}" maxlength="12" inputmode="tel" title="Введите номер в формате +7XXXXXXXXXX"><label class="visually-hidden" for="co-comment">Комментарий к заказу</label><textarea id="co-comment" placeholder="Комментарий к заказу"></textarea><button class="order-btn" id="order-btn">Оформить заказ</button></div>
    <div class="order-success" id="order-success"><h3>✅ Заказ принят!</h3><p id="order-success-text">Мы свяжемся с вами в ближайшее время.</p><button class="add-to-cart-btn" id="order-new-btn" style="margin-top:12px">Продолжить покупки</button></div>
  </div>
</div>
<div class="modal-overlay" id="video-modal" role="dialog" aria-modal="true"><div class="modal-box"><button class="modal-close" id="modal-close" aria-label="Закрыть">✕</button><video id="modal-video" controls playsinline></video></div></div>`;
  }

  function productPageHtml(product, products, contacts) {
    const title = titleFor(product);
    const description = descriptionFor(product);
    const url = productUrl(product);
    const stock = quantity(product);
    const price = retailPrice(product);
    const sale = isValidSale(product);
    const images = [...new Set((product.image_urls && product.image_urls.length ? product.image_urls : [product.image]).filter(Boolean).map(assetUrl))];
    const productLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: productName(product),
      sku: String(product.article),
      description,
      category: product.category_name || product.category || undefined,
      image: images.length ? images : undefined,
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'RUB',
        price: String(price),
        availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    };
    if (product.manufacturer_or_brand) productLd.brand = { '@type': 'Brand', name: product.manufacturer_or_brand };
    Object.keys(productLd).forEach(key => productLd[key] === undefined && delete productLd[key]);
    const categoryName = product.category_name || product.category || 'Каталог';
    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${cleanSiteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${cleanSiteUrl}/catalog` },
        { '@type': 'ListItem', position: 3, name: categoryName, item: categoryUrl(product.category_slug) },
        { '@type': 'ListItem', position: 4, name: productName(product), item: url },
      ],
    };
    const faq = faqFor(product);
    const faqLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
    };
    const attrs = characteristics(product);
    const updatedTimeHtml = stockUpdatedTimeHtml(product);
    const image = product.image || (product.image_urls && product.image_urls[0]);
    const longDescription = product.description ? `<section class="product-description" aria-labelledby="description-heading"><h2 id="description-heading">Описание</h2><p>${escH(product.description)}</p></section>` : '';
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escH(title)}</title>
  <meta name="description" content="${escH(description)}">
  <link rel="canonical" href="${escH(url)}">
  <meta property="og:title" content="${escH(title)}">
  <meta property="og:description" content="${escH(description)}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${escH(url)}">
  <meta property="og:site_name" content="СкладПромо">
  ${images[0] ? `<meta property="og:image" content="${escH(images[0])}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonForScript(productLd)}</script>
  <script type="application/ld+json">${jsonForScript(breadcrumbLd)}</script>
  <script type="application/ld+json">${jsonForScript(faqLd)}</script>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/product.css">
  ${analyticsHtml()}
</head>
<body>
${headerHtml(contacts)}
<main class="product-page-main">
  <div class="product-page-wrap">
    <nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><a href="/catalog">Каталог</a><span class="bc-sep">›</span><a href="/category/${encodeURIComponent(product.category_slug)}">${escH(categoryName)}</a><span class="bc-sep">›</span><span>${escH(productName(product))}</span></nav>
    <article class="product-detail" itemscope itemtype="https://schema.org/Product">
      ${image
        ? `<figure class="product-detail-media"><img src="/${escH(String(image).replace(/^\//, ''))}" alt="${escH(productName(product))}" class="product-detail-img" itemprop="image">${product.video_url || product.video ? `<button class="card-video-btn" id="video-btn" data-video="/${escH(String(product.video_url || product.video).replace(/^\//, ''))}">▶ Видео</button>` : ''}<figcaption class="visually-hidden">${escH(productName(product))}, арт. ${escH(product.article)}</figcaption></figure>`
        : `<div class="product-detail-media"><div class="product-detail-no-img">Нет фото</div>${product.video_url || product.video ? `<button class="card-video-btn" id="video-btn" data-video="/${escH(String(product.video_url || product.video).replace(/^\//, ''))}">▶ Видео</button>` : ''}</div>`}
      <div class="product-detail-info">
        <p class="product-detail-article">Арт. <span itemprop="sku">${escH(product.article)}</span></p>
        <h1 class="product-detail-name" itemprop="name">${escH(productName(product))}</h1>
        <div class="product-detail-prices" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="priceCurrency" content="RUB"><link itemprop="availability" href="${stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'}">
          ${sale ? `<p class="pdp-old-price">${priceText(product.old_price)} ₽</p><p class="pdp-sale-note">Скидка ${escH(product.discount_percent)}%. ${escH(product.sale_terms)}</p>` : ''}
          <p class="pdp-price pdp-retail"><data class="pdp-val" itemprop="price" value="${price}">${priceText(price)} ₽</data></p><p class="pdp-opt-note">Опт — по запросу</p>
        </div>
        <p class="product-detail-qty ${stock > 0 ? 'in-stock' : 'out-stock'}">${stock > 0 ? `В наличии: ${escH(String(stock))} шт.${updatedTimeHtml ? ` Остаток обновлён ${updatedTimeHtml}.` : ''}` : `Нет в наличии${updatedTimeHtml ? `. Остаток обновлён ${updatedTimeHtml}.` : ''}`}</p>
        <p class="product-factual-summary" itemprop="description">${escH(description)}</p>
        <div class="product-action-row">${stock > 0 ? `<button class="add-to-cart-btn" id="add-btn" data-article="${escH(product.article)}">В корзину</button>` : ''}<button type="button" class="wholesale-btn" id="wholesale-btn">Запросить оптовые условия</button></div>
      </div>
    </article>
    ${factsHtml(product)}
    ${attrs.length ? `<section class="product-characteristics" aria-labelledby="characteristics-heading"><h2 id="characteristics-heading">Характеристики</h2><table class="product-attrs"><caption class="visually-hidden">Характеристики товара «${escH(productName(product))}»</caption><thead><tr><th scope="col">Параметр</th><th scope="col">Значение</th></tr></thead><tbody>${attrs.map(([key, value]) => `<tr><th scope="row">${escH(key)}</th><td>${escH(value)}</td></tr>`).join('')}</tbody></table></section>` : ''}
    ${longDescription}
    <section class="product-wholesale" id="wholesale-request" aria-labelledby="wholesale-heading"><h2 id="wholesale-heading">Оптовые условия</h2><p>Оставьте номер телефона — менеджер подтвердит цену и условия для этой модели.</p><form id="wholesale-form"><fieldset><legend class="visually-hidden">Заявка на оптовые условия</legend><label class="visually-hidden" for="wholesale-name">Ваше имя</label><input id="wholesale-name" name="name" required placeholder="Ваше имя"><label class="visually-hidden" for="wholesale-contact">Телефон</label><input id="wholesale-contact" type="tel" name="contact" required placeholder="+7XXXXXXXXXX" pattern="\\+7\\d{10}" maxlength="12" inputmode="tel" title="Введите номер в формате +7XXXXXXXXXX"><label class="visually-hidden" for="wholesale-comment">Количество и комментарий</label><textarea id="wholesale-comment" name="comment" placeholder="Количество и комментарий"></textarea><button type="submit" class="wholesale-btn">Отправить запрос</button><p id="wholesale-status" aria-live="polite"></p></fieldset></form></section>
    ${faqHtml(faq)}
    ${relatedHtml(product, products)}
  </div>
</main>
${footerHtml(contacts)}
${cartHtml()}
<script>window.PRODUCT_DATA=${jsonForScript({ article: product.article, name: productName(product), price, qty: stock, image: image ? `/${String(image).replace(/^\//, '')}` : '' })};</script>
<script src="/js/product.js"></script>
<script>document.getElementById('wholesale-btn')?.addEventListener('click',()=>document.getElementById('wholesale-request').scrollIntoView({behavior:'smooth'}));document.getElementById('wholesale-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const status=document.getElementById('wholesale-status');const data=Object.fromEntries(new FormData(form));try{const response=await fetch('/api/wholesale-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article:${jsonForScript(String(product.article))},...data})});if(!response.ok)throw new Error();form.reset();status.textContent='Запрос принят.';window.skladTrack?.('generate_lead',{lead_type:'wholesale',item_id:${jsonForScript(String(product.article))}});}catch{status.textContent='Не удалось отправить запрос. Попробуйте ещё раз.';}});</script>
</body>
</html>`;
  }

  function categoryPageHtml(category, products, contacts, allProducts = []) {
    const title = `${category.name} — купить со склада | СкладПромо`;
    const description = `${category.name} со склада: актуальные цены и наличие товаров. Оптовые условия — по запросу.`;
    const intro = categoryIntro(category, products);
    const url = categoryUrl(category.slug);

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${cleanSiteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${cleanSiteUrl}/catalog` },
        { '@type': 'ListItem', position: 3, name: category.name, item: url },
      ],
    };
    const listLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: category.name,
      numberOfItems: products.length,
      itemListElement: products.map((item, i) => ({
        '@type': 'ListItem', position: i + 1, url: productUrl(item), name: productName(item),
      })),
    };

    // Смежные категории: соседи по алфавиту вокруг текущей. Раньше со страницы
    // категории вообще не было ссылок никуда, кроме логотипа и главной.
    const siblings = sortedCategories(allProducts).filter(c => c.slug !== category.slug);
    const idx = sortedCategories(allProducts).findIndex(c => c.slug === category.slug);
    const near = siblings.slice(Math.max(0, idx - 2), Math.max(0, idx - 2) + 4);
    const siblingsHtml = near.length
      ? `<nav class="category-siblings" aria-labelledby="siblings-heading"><h2 id="siblings-heading">Другие категории</h2><ul>${near.map(c => `<li><a href="/category/${encodeURIComponent(c.slug)}">${escH(c.name)}</a></li>`).join('')}<li><a href="/catalog">Весь каталог</a></li></ul></nav>`
      : '';

    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>${escH(title)}</title><meta name="description" content="${escH(description)}"><link rel="canonical" href="${escH(url)}"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escH(url)}"><meta property="og:site_name" content="СкладПромо"><script type="application/ld+json">${jsonForScript(breadcrumbLd)}</script><script type="application/ld+json">${jsonForScript(listLd)}</script><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/product.css">${analyticsHtml()}</head><body>${headerHtml(contacts)}<main class="category-page"><nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><a href="/catalog">Каталог</a><span class="bc-sep">›</span><span>${escH(category.name)}</span></nav><h1>${escH(category.name)}</h1><p class="category-intro">${escH(intro)}</p><div class="seo-product-grid">${products.map(item => productCardHtml(item)).join('')}</div>${siblingsHtml}</main>${footerHtml(contacts)}${cartHtml()}<script src="/js/product.js"></script></body></html>`;
  }

  function salePageHtml(products, contacts) {
    const title = 'Распродажа товаров со склада | СкладПромо';
    const description = 'Товары со склада с подтверждённой скидкой: старая и новая цена, размер скидки и условия акции.';
    const url = `${cleanSiteUrl}/sale`;
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${url}"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/product.css">${analyticsHtml()}</head><body>${headerHtml(contacts)}<main class="category-page"><nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><span>Распродажа</span></nav><h1>Распродажа товаров со склада</h1><div class="seo-product-grid">${products.map(item => productCardHtml(item, { sale: true })).join('')}</div></main>${footerHtml(contacts)}</body></html>`;
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  // Сводка по категории считается из самих товаров: число SKU, диапазон цен,
  // суммарный остаток и дата его обновления. Это фактические данные — они не
  // требуют подтверждения от бизнеса и при этом делают интро всех категорий
  // разными (сейчас у 20 из 20 интро побайтно равно meta description).
  function categoryStats(items) {
    const prices = items.map(retailPrice).filter(value => value > 0);
    return {
      count: items.length,
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      stock: items.reduce((sum, item) => sum + quantity(item), 0),
      updated: formatStockDate(items.map(item => item.stock_updated_at).filter(Boolean).sort().pop()),
    };
  }

  function categoryIntro(category, items) {
    const s = categoryStats(items);
    const parts = [`${category.name} со склада: ${s.count} ${plural(s.count, 'товар', 'товара', 'товаров')} в каталоге`];
    if (s.min && s.max) {
      parts.push(s.min === s.max
        ? `цена ${priceText(s.min)} ₽`
        : `цены от ${priceText(s.min)} до ${priceText(s.max)} ₽`);
    }
    if (s.stock > 0) parts.push(`${priceText(s.stock)} шт. в наличии`);
    // ru-RU уже отдаёт «17 июля 2026 г.» с точкой — вторую не добавляем.
    const updated = s.updated ? ` Остатки обновлены ${s.updated.replace(/\.$/, '')}.` : '';
    return `${parts.join(', ')}.${updated} Оптовые условия — по запросу.`;
  }

  function groupByCategory(products) {
    const map = new Map();
    products.filter(product => product.visible).forEach(product => {
      const slug = product.category_slug || 'catalog';
      if (!map.has(slug)) map.set(slug, []);
      map.get(slug).push(product);
    });
    return map;
  }

  function sortedCategories(products) {
    return [...categoriesFrom(products).values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  // Карточка SSR-грида главной. Разметка намеренно повторяет ту, что строит
  // renderProducts() в public/js/shop.js: грид перерисовывается на клиенте, и
  // при расхождении разметки пользователь увидел бы скачок при гидратации.
  function homeProductCardHtml(product) {
    const stock = quantity(product);
    const url = `/product/${encodeURIComponent(productSlug(product))}`;
    const image = product.image || (product.image_urls && product.image_urls[0]) || '';
    const name = product.name || productName(product);
    return `
      <div class="product-card">
        <a href="${url}" class="card-img-link" tabindex="-1" aria-hidden="true">
          <div class="card-img-wrap">
            <img src="${escH(image)}" alt="${escH(name)}" loading="lazy"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eee%22/></svg>'">
          </div>
        </a>
        <div class="card-body">
          <span class="card-article">Арт. ${escH(product.article)}</span>
          <a href="${url}" class="card-name">${escH(name)}</a>
          <div class="card-prices">
            <span class="card-price">${priceText(retailPrice(product))} ₽</span>
            <span class="card-opt-note">Опт — по запросу</span>
          </div>
          <span class="card-qty ${stock > 0 ? 'in-stock' : 'out-stock'}">${stock > 0 ? `В наличии: ${stock} шт.` : 'Нет в наличии'}</span>
          ${stock > 0 ? `<button class="add-to-cart-btn" data-article="${escH(product.article)}">В корзину</button>` : ''}
        </div>
      </div>`;
  }

  function categoryDirectoryHtml(categories, byCategory) {
    const items = categories.map(category => {
      const count = (byCategory.get(category.slug) || []).length;
      return `<li><a href="/category/${encodeURIComponent(category.slug)}">${escH(category.name)}</a> <span class="cat-count">${count}</span></li>`;
    }).join('');
    return `<nav class="category-directory" aria-labelledby="categories-heading">
    <h2 id="categories-heading">Категории каталога</h2>
    <ul class="category-directory-list">${items}</ul>
    <p><a href="/catalog" class="category-directory-all">Весь каталог — все категории и товары</a></p>
  </nav>`;
  }

  function homePageHtml(products, contacts = {}) {
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const visible = products.filter(product => product.visible);
    // Тот же срез и тот же порядок, что отдаёт /api/products, — чтобы после
    // гидратации грид не перестроился.
    const listed = visible.filter(product => Number(product.qty) > 0);
    const categories = sortedCategories(products);
    const byCategory = groupByCategory(products);

    const title = 'Сувениры и бизнес-подарки со склада оптом | СкладПромо';
    const description = 'Сувенирная продукция и бизнес-подарки в наличии: цены и остатки на складе. Оптовые условия — по запросу.';

    // WebSite без SearchAction: поиск на сайте чисто клиентский, отдельного
    // индексируемого URL результатов нет — заявлять его было бы неправдой.
    const websiteLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'СкладПромо',
      url: `${cleanSiteUrl}/`,
      inLanguage: 'ru-RU',
    };
    const categoryListLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Категории каталога',
      numberOfItems: categories.length,
      itemListElement: categories.map((category, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: categoryUrl(category.slug),
        name: category.name,
      })),
    };

    const head = `<title>${escH(title)}</title><meta name="description" content="${escH(description)}"><link rel="canonical" href="${cleanSiteUrl}/"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${cleanSiteUrl}/"><meta property="og:site_name" content="СкладПромо"><script type="application/ld+json">${jsonForScript(websiteLd)}</script><script type="application/ld+json">${jsonForScript(categoryListLd)}</script>${analyticsHtml()}`;

    // Hero берётся из contacts.json с тем же fallback, что и в shop.js:367 —
    // иначе SSR-текст и текст после гидратации расходятся, как только
    // администратор отредактирует баннер.
    const heroTitle = contacts.hero_title || 'Сувенирная продукция и бизнес-подарки со склада';
    const heroText = contacts.hero_text || 'Товары со склада с актуальными ценами и остатками.';

    return index.replace(/<title>[\s\S]*?<\/title>/i, head)
      .replace(/<h1 id="hero-title">[\s\S]*?<\/h1>/i, `<h1 id="hero-title">${escH(heroTitle)}</h1>`)
      .replace(/<p id="hero-text">[\s\S]*?<\/p>/i, `<p id="hero-text">${escH(heroText)}</p>`)
      .replace('<div class="catalog-layout">', `${categoryDirectoryHtml(categories, byCategory)}\n  <div class="catalog-layout">`)
      .replace('<div class="products-grid" id="products-grid"></div>',
        `<div class="products-grid" id="products-grid">${listed.map(homeProductCardHtml).join('')}</div>`);
  }

  function catalogPageHtml(products, contacts) {
    const categories = sortedCategories(products);
    const byCategory = groupByCategory(products);
    const title = 'Каталог товаров со склада — все категории | СкладПромо';
    const total = products.filter(product => product.visible).length;
    const description = `Каталог со склада: ${categories.length} ${plural(categories.length, 'категория', 'категории', 'категорий')}, ${total} ${plural(total, 'товар', 'товара', 'товаров')} с актуальными ценами и остатками.`;
    const url = `${cleanSiteUrl}/catalog`;

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${cleanSiteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Каталог', item: url },
      ],
    };
    const listLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Категории каталога',
      numberOfItems: categories.length,
      itemListElement: categories.map((category, i) => ({
        '@type': 'ListItem', position: i + 1, url: categoryUrl(category.slug), name: category.name,
      })),
    };

    const sections = categories.map(category => {
      const items = byCategory.get(category.slug) || [];
      return `<section class="catalog-category">
    <h2><a href="/category/${encodeURIComponent(category.slug)}">${escH(category.name)}</a> <span class="cat-count">${items.length}</span></h2>
    <p class="category-intro">${escH(categoryIntro(category, items))}</p>
    <ul class="catalog-product-list">${items.map(item => `<li><a href="/product/${encodeURIComponent(productSlug(item))}">${escH(productName(item))}</a> — ${priceText(retailPrice(item))} ₽</li>`).join('')}</ul>
  </section>`;
    }).join('');

    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>${escH(title)}</title><meta name="description" content="${escH(description)}"><link rel="canonical" href="${escH(url)}"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escH(url)}"><meta property="og:site_name" content="СкладПромо"><script type="application/ld+json">${jsonForScript(breadcrumbLd)}</script><script type="application/ld+json">${jsonForScript(listLd)}</script><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/product.css">${analyticsHtml()}</head><body>${headerHtml(contacts)}<main class="category-page"><nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><span>Каталог</span></nav><h1>Каталог товаров со склада</h1><p class="category-intro">${escH(description)}</p>${sections}</main>${footerHtml(contacts)}</body></html>`;
  }

  function categoriesFrom(products) {
    const map = new Map();
    products.filter(product => product.visible).forEach(product => {
      const slug = product.category_slug || 'catalog';
      if (!map.has(slug)) map.set(slug, { slug, name: product.category_name || product.category || 'Каталог' });
    });
    return map;
  }

  const contactsFile = () => path.join(path.dirname(productsFile), 'contacts.json');

  router.get('/', (req, res) => {
    res.send(homePageHtml(readJSON(productsFile, []), readJSON(contactsFile(), {})));
  });

  router.get('/catalog', (req, res) => {
    res.send(catalogPageHtml(readJSON(productsFile, []), readJSON(contactsFile(), {})));
  });

  // POST /api/wholesale-request теперь в server.js — нужен доступ к
  // CONTACTS_FILE и Telegram-уведомлениям, которых нет в этом роутере.

  router.get('/product/:slug', (req, res) => {
    const products = readJSON(productsFile, []);
    const slug = req.params.slug;
    let product = products.find(item => item.visible && productSlug(item) === slug);
    if (!product) product = products.find(item => item.visible && Array.isArray(item.previous_slugs) && item.previous_slugs.includes(slug));
    if (product && productSlug(product) !== slug) return res.redirect(301, `/product/${encodeURIComponent(productSlug(product))}`);
    if (!product) {
      const legacy = products.find(item => item.visible && (String(item.article) === slug || slug.endsWith(`-${item.article}`)));
      if (legacy) return res.redirect(301, `/product/${encodeURIComponent(productSlug(legacy))}`);
      return res.status(404).type('html').send('<!doctype html><title>Товар не найден</title><h1>Товар не найден</h1>');
    }
    res.send(productPageHtml(product, products.filter(item => item.visible), readJSON(path.join(path.dirname(productsFile), 'contacts.json'), {})));
  });

  router.get('/category/:slug', (req, res) => {
    const products = readJSON(productsFile, []).filter(product => product.visible);
    const category = categoriesFrom(products).get(req.params.slug);
    if (!category) return res.status(404).type('html').send('<!doctype html><title>Категория не найдена</title><h1>Категория не найдена</h1>');
    res.send(categoryPageHtml(category, products.filter(product => (product.category_slug || 'catalog') === category.slug), readJSON(contactsFile(), {}), products));
  });

  router.get('/sale', (req, res) => {
    const saleProducts = readJSON(productsFile, []).filter(product => product.visible && isValidSale(product));
    if (!saleProducts.length) return res.status(404).type('html').send('<!doctype html><title>Распродажа не проводится</title><h1>Распродажа не проводится</h1>');
    res.send(salePageHtml(saleProducts, readJSON(path.join(path.dirname(productsFile), 'contacts.json'), {})));
  });

  router.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /admin-help.html\nDisallow: /api/\nDisallow: /cart/\nDisallow: /*?\n\nSitemap: ${cleanSiteUrl}/sitemap.xml`);
  });

  router.get('/sitemap.xml', (req, res) => {
    const products = readJSON(productsFile, []).filter(product => product.visible);
    const categories = [...categoriesFrom(products).values()];
    const saleProducts = products.filter(isValidSale);
    // Максимальная дата изменения из набора товаров.
    // Прежний вариант — .sort().pop() — возвращал undefined, если хотя бы у
    // одного товара не было обеих дат (sort() всегда уносит undefined в конец),
    // и тогда <lastmod> молча пропадал у всей категории.
    const latestChange = items => lastmod(
      items.map(product => product.seo_updated_at || product.stock_updated_at)
        .filter(Boolean).sort().pop()
    );
    // Дата главной — по самому свежему товару, а не по mtime index.html:
    // mtime — это время выкладки файла, а не изменения контента.
    const urls = [
      { loc: `${cleanSiteUrl}/`, priority: '1.0', modified: pageChanged(latestChange(products)) },
      { loc: `${cleanSiteUrl}/catalog`, priority: '0.9', modified: pageChanged(latestChange(products)) },
      // Ключ категории строится как `category_slug || 'catalog'` — фильтровать
      // надо по тому же выражению, иначе синтетическая категория 'catalog'
      // никогда не найдёт собственные товары.
      ...categories.map(category => ({
        loc: categoryUrl(category.slug),
        priority: '0.7',
        modified: pageChanged(latestChange(products.filter(product => (product.category_slug || 'catalog') === category.slug))),
      })),
      ...products.map(product => ({ loc: productUrl(product), priority: '0.8', modified: pageChanged(lastmod(product.seo_updated_at || product.stock_updated_at)) })),
      ...(saleProducts.length ? [{ loc: `${cleanSiteUrl}/sale`, priority: '0.6', modified: pageChanged(latestChange(saleProducts)) }] : []),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(item => `  <url><loc>${escH(item.loc)}</loc>${item.modified ? `<lastmod>${item.modified}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  });

  router.get('/llms.txt', (req, res) => {
    const products = readJSON(productsFile, []).filter(product => product.visible);
    const categories = sortedCategories(products);
    const byCategory = groupByCategory(products);

    const categoryLines = categories.map(category => {
      const items = byCategory.get(category.slug) || [];
      const s = categoryStats(items);
      const range = s.min && s.max
        ? (s.min === s.max ? `${priceText(s.min)} ₽` : `${priceText(s.min)}–${priceText(s.max)} ₽`)
        : '—';
      return `- [${category.name}](${categoryUrl(category.slug)}) — ${items.length} ${plural(items.length, 'товар', 'товара', 'товаров')}, ${range}, ${priceText(s.stock)} шт. в наличии.`;
    });

    const productLines = products.map(product => `- [${productName(product)}](${productUrl(product)}) — ${priceText(retailPrice(product))} ₽, ${inStock(product) ? `в наличии ${quantity(product)} шт.` : 'нет в наличии'}, арт. ${product.article}.`);

    // Дата генерации и дата среза остатков: потребителю (в т.ч. AI) важно
    // понимать, насколько свежи цифры. Никаких сведений о доставке, регионе,
    // юрлице и минимальном заказе здесь нет — они не подтверждены.
    const stockDate = lastmod(products.map(p => p.stock_updated_at).filter(Boolean).sort().pop());

    res.type('text/plain').send(
`# СкладПромо — товары со склада

> Каталог сувенирной продукции и бизнес-подарков с наличием и ценами со склада.
> Цены указаны розничные, в рублях. Оптовые условия — по запросу через форму на странице товара.

generated_at: ${new Date().toISOString()}
stock_updated_at: ${stockDate || 'неизвестно'}

## Навигация

- [Главная](${cleanSiteUrl}/)
- [Весь каталог](${cleanSiteUrl}/catalog)

## Категории (${categories.length})

${categoryLines.join('\n')}

## Каталог товаров (${products.length})

${productLines.join('\n')}
`);
  });

  function feedDescription(product) { return descriptionFor(product); }
  function feedImage(product) { return product.feed_image || product.image || (product.image_urls && product.image_urls[0]); }

  // Фиды используют домен, с которого их реально запросили (а не фиксированный
  // canonical SITE_URL): Merchant Center/Вебмастер обходят feed-URL и должны
  // получить рабочие ссылки на этот же домен, иначе они не открываются. Как
  // только основной домен подключат и фид переподают через него — ссылки
  // автоматически станут канонical-домена, без правок кода.
  function feedBaseUrl(req) {
    const host = req.get('host');
    return host ? `https://${host}` : cleanSiteUrl;
  }

  router.get('/feeds/google.xml', (req, res) => {
    const base = feedBaseUrl(req);
    const feedProductUrl = product => `${base}/product/${encodeURIComponent(productSlug(product))}`;
    const feedAssetUrl = file => file ? `${base}/${String(file).replace(/^\//, '')}` : '';
    const products = readJSON(productsFile, []).filter(product => product.visible);
    const items = products.map(product => {
      const image = feedImage(product);
      return `    <item><g:id>${escH(product.article)}</g:id><g:title>${escH(productName(product))}</g:title><g:description>${escH(feedDescription(product))}</g:description><g:link>${escH(feedProductUrl(product))}</g:link>${image ? `<g:image_link>${escH(feedAssetUrl(image))}</g:image_link>` : ''}<g:availability>${inStock(product) ? 'in_stock' : 'out_of_stock'}</g:availability><g:price>${retailPrice(product)}.00 RUB</g:price><g:condition>new</g:condition>${product.manufacturer_or_brand ? `<g:brand>${escH(product.manufacturer_or_brand)}</g:brand>` : ''}<g:identifier_exists>no</g:identifier_exists></item>`;
    }).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>СкладПромо</title><link>${base}/</link><description>Товары со склада</description>${items}</channel></rss>`);
  });

  router.get('/feeds/yandex.yml', (req, res) => {
    const base = feedBaseUrl(req);
    const feedProductUrl = product => `${base}/product/${encodeURIComponent(productSlug(product))}`;
    const feedAssetUrl = file => file ? `${base}/${String(file).replace(/^\//, '')}` : '';
    const products = readJSON(productsFile, []).filter(product => product.visible);
    const categories = [...categoriesFrom(products).values()];
    const ids = Object.fromEntries(categories.map((category, index) => [category.slug, index + 2]));
    const categoriesXml = [`<category id="1">Каталог</category>`, ...categories.map(category => `<category id="${ids[category.slug]}" parentId="1">${escH(category.name)}</category>`)].join('');
    const offers = products.map(product => { const image = feedImage(product); return `<offer id="${escH(product.article)}" available="${inStock(product)}"><url>${escH(feedProductUrl(product))}</url><price>${retailPrice(product)}</price><currencyId>RUB</currencyId><categoryId>${ids[product.category_slug] || 1}</categoryId>${image ? `<picture>${escH(feedAssetUrl(image))}</picture>` : ''}${product.manufacturer_or_brand ? `<vendor>${escH(product.manufacturer_or_brand)}</vendor>` : ''}<name>${escH(productName(product))}</name><description>${escH(feedDescription(product))}</description></offer>`; }).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><yml_catalog date="${new Date().toISOString().slice(0, 16).replace('T', ' ')}"><shop><name>СкладПромо</name><company>СкладПромо</company><url>${base}/</url><currencies><currency id="RUB" rate="1"/></currencies><categories>${categoriesXml}</categories><offers>${offers}</offers></shop></yml_catalog>`);
  });

  return router;
}

module.exports = { createSeoRouter };
