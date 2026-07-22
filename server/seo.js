'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

function createSeoRouter({ productsFile, publicDir, siteUrl, readJSON, writeJSON, escH }) {
  const router = express.Router();
  const requestsFile = path.join(path.dirname(productsFile), 'wholesale-requests.json');
  const cleanSiteUrl = String(siteUrl).replace(/\/$/, '');

  const productName = p => p.seo_name || p.name || `Товар ${p.article}`;
  const productSlug = p => p.slug || slugify(`${productName(p)}-${p.article}`);
  const productUrl = p => `${cleanSiteUrl}/product/${encodeURIComponent(productSlug(p))}`;
  const categoryUrl = slug => `${cleanSiteUrl}/category/${encodeURIComponent(slug)}`;
  const assetUrl = file => file ? `${cleanSiteUrl}/${String(file).replace(/^\//, '')}` : '';
  const quantity = p => Number.isFinite(Number(p.stock_qty)) ? Number(p.stock_qty) : Number(p.qty) || 0;
  const retailPrice = p => Number.isFinite(Number(p.retail_price)) ? Number(p.retail_price) : (Number(p.price) || 0) * 3;
  const wholesalePrice = p => Number.isFinite(Number(p.wholesale_price_from)) ? Number(p.wholesale_price_from) : Number(p.price) || 0;
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

  function lastmod(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
  }

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

  function footerHtml(contacts = {}) {
    return '<footer class="site-footer"><p>© 2024 СкладПромо. Все права защищены.</p></footer>';
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
    const template = product.meta_description_template || product.meta_description;
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
    const updated = formatStockDate(product.stock_updated_at);
    const facts = [
      ['Артикул', product.article],
      product.material && ['Материал', product.material],
      product.color && ['Цвет', product.color],
      ['Наличие', stock > 0 ? `На складе: ${stock} шт.${updated ? ` (обновлено ${updated})` : ''}` : `Нет в наличии${updated ? ` (обновлено ${updated})` : ''}`],
    ].filter(Boolean);
    return `<section class="product-facts" aria-labelledby="facts-heading">
  <h2 id="facts-heading">Коротко о товаре</h2>
  <dl>${facts.map(([key, value]) => `<div><dt>${escH(key)}</dt><dd>${escH(value)}</dd></div>`).join('')}</dl>
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
    if (!related.length) return `<section class="related-products" aria-labelledby="related-heading"><h2 id="related-heading">Похожие товары</h2><p>В этой категории пока нет других товаров.</p></section>`;
    return `<section class="related-products" aria-labelledby="related-heading">
  <h2 id="related-heading">Похожие товары</h2>
  <div class="seo-product-grid">${related.map(item => productCardHtml(item)).join('')}</div>
</section>`;
  }

  function cartHtml() {
    return `<div class="cart-overlay" id="cart-overlay"></div>
<div class="cart-drawer" id="cart-drawer" aria-label="Корзина">
  <div class="cart-header"><span>Корзина</span><button class="cart-close" id="cart-close" aria-label="Закрыть">✕</button></div>
  <div class="cart-items" id="cart-items"><p class="cart-empty">Корзина пуста</p></div>
  <div class="cart-footer" id="cart-footer" style="display:none">
    <div class="cart-total"><span>Итого:</span><span id="cart-total-val">0 ₽</span></div>
    <div class="checkout-form" id="checkout-form"><input type="text" id="co-name" placeholder="Ваше имя *" required><input type="tel" id="co-phone" placeholder="Телефон *" required><textarea id="co-comment" placeholder="Комментарий к заказу"></textarea><button class="order-btn" id="order-btn">Оформить заказ</button></div>
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
        { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${cleanSiteUrl}/` },
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
    const updated = formatStockDate(product.stock_updated_at);
    const image = product.image || (product.image_urls && product.image_urls[0]);
    const longDescription = product.description ? `<section class="product-description" aria-labelledby="description-heading"><h2 id="description-heading">Описание</h2><p>${escH(product.description)}</p></section>` : '';
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
</head>
<body>
${headerHtml(contacts)}
<main class="product-page-main">
  <div class="product-page-wrap">
    <nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><a href="/">Каталог</a><span class="bc-sep">›</span><a href="/category/${encodeURIComponent(product.category_slug)}">${escH(categoryName)}</a><span class="bc-sep">›</span><span>${escH(productName(product))}</span></nav>
    <article class="product-detail" itemscope itemtype="https://schema.org/Product">
      <div class="product-detail-media">${image ? `<img src="/${escH(String(image).replace(/^\//, ''))}" alt="${escH(productName(product))}" class="product-detail-img" itemprop="image">` : '<div class="product-detail-no-img">Нет фото</div>'}${product.video_url || product.video ? `<button class="card-video-btn" id="video-btn" data-video="/${escH(String(product.video_url || product.video).replace(/^\//, ''))}">▶ Видео</button>` : ''}</div>
      <div class="product-detail-info">
        <p class="product-detail-article">Арт. <span itemprop="sku">${escH(product.article)}</span></p>
        <h1 class="product-detail-name" itemprop="name">${escH(productName(product))}</h1>
        <div class="product-detail-prices" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="priceCurrency" content="RUB"><link itemprop="availability" href="${stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'}">
          ${sale ? `<p class="pdp-old-price">${priceText(product.old_price)} ₽</p><p class="pdp-sale-note">Скидка ${escH(product.discount_percent)}%. ${escH(product.sale_terms)}</p>` : ''}
          <p class="pdp-price pdp-retail"><span class="pdp-val" itemprop="price" content="${price}">${priceText(price)} ₽</span></p><p class="pdp-opt-note">Опт — по запросу</p>
        </div>
        <p class="product-detail-qty ${stock > 0 ? 'in-stock' : 'out-stock'}">${stock > 0 ? `В наличии: ${stock} шт.${updated ? ` Остаток обновлён ${escH(updated)}.` : ''}` : `Нет в наличии${updated ? `. Остаток обновлён ${escH(updated)}.` : ''}`}</p>
        <p class="product-factual-summary" itemprop="description">${escH(description)}</p>
        <div class="product-action-row">${stock > 0 ? `<button class="add-to-cart-btn" id="add-btn" data-article="${escH(product.article)}">В корзину</button>` : ''}<button type="button" class="wholesale-btn" id="wholesale-btn">Запросить оптовые условия</button></div>
      </div>
    </article>
    ${factsHtml(product)}
    ${attrs.length ? `<section class="product-characteristics" aria-labelledby="characteristics-heading"><h2 id="characteristics-heading">Характеристики</h2><table class="product-attrs">${attrs.map(([key, value]) => `<tr><th>${escH(key)}</th><td>${escH(value)}</td></tr>`).join('')}</table></section>` : ''}
    ${longDescription}
    <section class="product-wholesale" id="wholesale-request" aria-labelledby="wholesale-heading"><h2 id="wholesale-heading">Оптовые условия</h2><p>Оставьте контакты — менеджер подтвердит цену и условия для этой модели.</p><form id="wholesale-form"><input name="name" required placeholder="Ваше имя"><input name="contact" required placeholder="Телефон или email"><textarea name="comment" placeholder="Количество и комментарий"></textarea><button type="submit" class="wholesale-btn">Отправить запрос</button><p id="wholesale-status" aria-live="polite"></p></form></section>
    ${faqHtml(faq)}
    ${relatedHtml(product, products)}
  </div>
</main>
${footerHtml(contacts)}
${cartHtml()}
<script>window.PRODUCT_DATA=${jsonForScript({ article: product.article, name: productName(product), price, qty: stock, image: image ? `/${String(image).replace(/^\//, '')}` : '' })};</script>
<script src="/js/product.js"></script>
<script>document.getElementById('wholesale-btn')?.addEventListener('click',()=>document.getElementById('wholesale-request').scrollIntoView({behavior:'smooth'}));document.getElementById('wholesale-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const status=document.getElementById('wholesale-status');const data=Object.fromEntries(new FormData(form));try{const response=await fetch('/api/wholesale-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article:${jsonForScript(String(product.article))},...data})});if(!response.ok)throw new Error();form.reset();status.textContent='Запрос принят.';}catch{status.textContent='Не удалось отправить запрос. Попробуйте ещё раз.';}});</script>
</body>
</html>`;
  }

  function categoryPageHtml(category, products, contacts) {
    const title = `${category.name} — купить со склада | СкладПромо`;
    const description = `${category.name} со склада: актуальные цены и наличие товаров. Оптовые условия — по запросу.`;
    const url = categoryUrl(category.slug);
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escH(title)}</title><meta name="description" content="${escH(description)}"><link rel="canonical" href="${escH(url)}"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escH(url)}"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/product.css"></head><body>${headerHtml(contacts)}<main class="category-page"><nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><a href="/">Каталог</a><span class="bc-sep">›</span><span>${escH(category.name)}</span></nav><h1>${escH(category.name)}</h1><p class="category-intro">${escH(description)}</p><div class="seo-product-grid">${products.map(item => productCardHtml(item)).join('')}</div></main>${footerHtml(contacts)}</body></html>`;
  }

  function salePageHtml(products, contacts) {
    const title = 'Распродажа товаров со склада | СкладПромо';
    const description = 'Товары со склада с подтверждённой скидкой: старая и новая цена, размер скидки и условия акции.';
    const url = `${cleanSiteUrl}/sale/`;
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${url}"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/product.css"></head><body>${headerHtml(contacts)}<main class="category-page"><nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><span>Распродажа</span></nav><h1>Распродажа товаров со склада</h1><div class="seo-product-grid">${products.map(item => productCardHtml(item, { sale: true })).join('')}</div></main>${footerHtml(contacts)}</body></html>`;
  }

  function homePageHtml() {
    const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
    const title = 'Сувениры и бизнес-подарки со склада — оптом, в наличии | СкладПромо';
    const description = 'Сувенирная продукция и бизнес-подарки со склада: актуальные цены и остатки товаров.';
    const head = `<title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${cleanSiteUrl}/"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${cleanSiteUrl}/">`;
    return index.replace(/<title>[\s\S]*?<\/title>/i, head)
      .replace(/<h1 id="hero-title">[\s\S]*?<\/h1>/i, '<h1 id="hero-title">Сувенирная продукция и бизнес-подарки со склада</h1>')
      .replace(/<p id="hero-text">[\s\S]*?<\/p>/i, '<p id="hero-text">Товары со склада с актуальными ценами и остатками.</p>');
  }

  function categoriesFrom(products) {
    const map = new Map();
    products.filter(product => product.visible).forEach(product => {
      const slug = product.category_slug || 'catalog';
      if (!map.has(slug)) map.set(slug, { slug, name: product.category_name || product.category || 'Каталог' });
    });
    return map;
  }

  router.get('/', (req, res) => res.send(homePageHtml()));

  router.post('/api/wholesale-request', (req, res) => {
    const article = String(req.body?.article || '');
    const name = String(req.body?.name || '').trim();
    const contact = String(req.body?.contact || '').trim();
    if (!article || !name || !contact) return res.status(400).json({ error: 'Заполните имя и контакт для связи' });
    const product = readJSON(productsFile, []).find(item => String(item.article) === article && item.visible);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    const requests = readJSON(requestsFile, []);
    requests.unshift({ id: Date.now().toString(36).toUpperCase(), type: 'wholesale_request', created_at: new Date().toISOString(), article, product_name: productName(product), name, contact, comment: String(req.body?.comment || '').trim() });
    writeJSON(requestsFile, requests);
    res.status(201).json({ ok: true });
  });

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
    res.send(categoryPageHtml(category, products.filter(product => (product.category_slug || 'catalog') === category.slug), readJSON(path.join(path.dirname(productsFile), 'contacts.json'), {})));
  });

  router.get('/sale/', (req, res) => {
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
    const urls = [
      { loc: `${cleanSiteUrl}/`, priority: '1.0', modified: lastmod(fs.statSync(path.join(publicDir, 'index.html')).mtime) },
      ...categories.map(category => ({ loc: categoryUrl(category.slug), priority: '0.7', modified: lastmod(products.filter(product => product.category_slug === category.slug).map(product => product.seo_updated_at || product.stock_updated_at).sort().pop()) })),
      ...products.map(product => ({ loc: productUrl(product), priority: '0.8', modified: lastmod(product.seo_updated_at || product.stock_updated_at) })),
      ...(saleProducts.length ? [{ loc: `${cleanSiteUrl}/sale/`, priority: '0.6', modified: lastmod(saleProducts.map(product => product.seo_updated_at || product.stock_updated_at).sort().pop()) }] : []),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(item => `  <url><loc>${escH(item.loc)}</loc>${item.modified ? `<lastmod>${item.modified}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  });

  router.get('/llms.txt', (req, res) => {
    const products = readJSON(productsFile, []).filter(product => product.visible);
    const lines = products.map(product => `- [${productName(product)}](${productUrl(product)}) — ${priceText(retailPrice(product))} ₽, ${inStock(product) ? `в наличии ${quantity(product)} шт.` : 'нет в наличии'}, арт. ${product.article}.`);
    res.type('text/plain').send(`# СкладПромо — товары со склада\n\n> Актуальные цены и остатки. Оптовые условия — по запросу.\n\n## Каталог товаров (${products.length})\n\n${lines.join('\n')}\n`);
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
