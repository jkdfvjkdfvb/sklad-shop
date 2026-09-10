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
  // Реального производителя в выгрузке поставщика нет ни у одного из 69 SKU
  // (manufacturer_or_brand пусто везде) — это гап каталога, а не наш выбор.
  // Яндекс требует brand как обязательное поле в Product-микроразметке; пока
  // ассортимент не брендированный, используем домен магазина как продавца.
  // Источник один — как только придёт выгрузка с реальным брендом,
  // product.manufacturer_or_brand перекроет это значение сам, без правок здесь.
  const DEFAULT_BRAND = 'salegifts.ru';
  const brandName = p => p.manufacturer_or_brand || DEFAULT_BRAND;

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
  // семантика карточки), но остатки не трогались с 17.07.2026 — и все публичные URL
  // ушли в sitemap с июльской датой. Google скачал его и прочитал «с июля
  // ничего не менялось»: сигнал НЕ переобходить, ровно обратный нужному.
  //
  // Дату правим руками и только когда меняется то, что видит робот. Ставить
  // сюда время выкатки нельзя: lastmod обновлялся бы на каждом деплое, включая
  // правки, невидимые на странице, — это и есть тот искусственный lastmod,
  // которому поисковики со временем перестают верить.
  const TEMPLATE_CHANGED_AT = '2026-09-07';
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
      ['max', 'MAX', validUrl(contacts.max, ['max.ru/username'])],
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

  function faviconHtml() {
    return '<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/apple-touch-icon.png" type="image/png" sizes="180x180"><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">';
  }

  // .seo-card стартует с opacity:0 и ждёт observeReveal() из product.js
  // (см. public/css/style.css). Без JS карточки остались бы невидимыми
  // навсегда — noscript-страховка форсирует видимость.
  function revealNoscriptHtml() {
    return '<noscript><style>.seo-card{opacity:1!important;transform:none!important}</style></noscript>';
  }

  // Ru→en для schema.org dayOfWeek — сохраняем в company.json короткими
  // русскими кодами (их видит и правит владелец в админке), переводим только
  // на выходе в JSON-LD, где формат жёстко задан спецификацией.
  const SCHEMA_DAY_NAMES = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
  };
  const RU_DAY_LABELS = {
    mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс',
  };
  function workingDaysText(days) {
    return (Array.isArray(days) ? days : []).map(d => RU_DAY_LABELS[d]).filter(Boolean).join(', ');
  }

  function organizationLd(contacts = {}, company = {}) {
    const phone = validPhone(contacts.phone);
    const email = validEmail(contacts.email);
    const sameAs = socialLinksFor(contacts).map(([, , url]) => url);
    const hasAddress = Boolean(company.warehouse_address && company.warehouse_city);
    const organization = {
      '@context': 'https://schema.org',
      // Store — только когда есть реальный адрес: без него это было бы
      // заявкой на локальное ранжирование без факта, который её подтверждает.
      '@type': hasAddress ? ['Organization', 'Store'] : 'Organization',
      '@id': `${cleanSiteUrl}/#organization`,
      name: 'СкладПромо',
      url: `${cleanSiteUrl}/`,
      logo: `${cleanSiteUrl}/apple-touch-icon.png`,
    };
    if (company.legal_name) organization.legalName = company.legal_name;
    if (sameAs.length) organization.sameAs = sameAs;
    if (phone || email) {
      organization.contactPoint = {
        '@type': 'ContactPoint',
        contactType: 'sales',
        ...(phone ? { telephone: phone } : {}),
        ...(email ? { email } : {}),
      };
    }
    const identifiers = [];
    if (company.inn) identifiers.push({ '@type': 'PropertyValue', name: 'ИНН', value: String(company.inn) });
    if (company.ogrn) identifiers.push({ '@type': 'PropertyValue', name: 'ОГРН', value: String(company.ogrn) });
    if (identifiers.length) organization.identifier = identifiers;
    if (hasAddress) {
      organization.address = {
        '@type': 'PostalAddress',
        addressLocality: company.warehouse_city,
        ...(company.warehouse_address ? { streetAddress: company.warehouse_address } : {}),
        addressCountry: 'RU',
      };
    }
    if (company.warehouse_lat && company.warehouse_lng) {
      organization.geo = {
        '@type': 'GeoCoordinates',
        latitude: Number(company.warehouse_lat),
        longitude: Number(company.warehouse_lng),
      };
    }
    if (Array.isArray(company.working_days) && company.working_days.length
        && company.working_hours_from && company.working_hours_to) {
      organization.openingHoursSpecification = {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: company.working_days.map(d => SCHEMA_DAY_NAMES[d]).filter(Boolean),
        opens: company.working_hours_from,
        closes: company.working_hours_to,
      };
    }
    return organization;
  }

  // Используется и в шаблонных SSR-страницах (через footerHtml), и на главной
  // (её footer — статическая разметка index.html, обновляемая через .replace,
  // а не эта функция) — поэтому вынесена отдельно, а не встроена в footerHtml.
  function requisitesHtml(company = {}) {
    const requisiteLines = [
      company.legal_name ? escH(company.legal_name) : '',
      company.inn ? `ИНН ${escH(company.inn)}` : '',
      company.kpp ? `КПП ${escH(company.kpp)}` : '',
      company.ogrn ? `ОГРН ${escH(company.ogrn)}` : '',
      company.legal_address ? `Юр. адрес: ${escH(company.legal_address)}` : '',
    ].filter(Boolean);
    const bankLines = [
      company.bank_name ? `Банк: ${escH(company.bank_name)}` : '',
      company.bank_account ? `Р/с ${escH(company.bank_account)}` : '',
      company.bank_corr_account ? `К/с ${escH(company.bank_corr_account)}` : '',
      company.bank_bik ? `БИК ${escH(company.bank_bik)}` : '',
    ].filter(Boolean);
    // Реквизиты появляются в футере целиком только когда заполнено главное
    // (название юрлица) — набор из одних банковских строк без имени
    // организации не идентифицирует продавца и по 152-ФЗ/деловому обороту
    // сам по себе бесполезен.
    if (!company.legal_name) return '';
    return `<address class="site-requisites">${requisiteLines.join('<br>')}${bankLines.length ? `<br>${bankLines.join(', ')}` : ''}</address>`;
  }

  function footerHtml(contacts = {}, company = {}) {
    // Год берётся из системного времени, а не зашит: в footer он устаревал
    // молча — «2024» провисел до августа 2026-го.
    return `<footer class="site-footer">${requisitesHtml(company)}<div class="footer-links" style="margin-bottom: 8px"><a href="/delivery" style="text-decoration: underline">Доставка и оплата</a> &bull; <a href="/catalog" style="text-decoration: underline">Каталог</a>${company.legal_name ? ' &bull; <a href="/privacy" style="text-decoration: underline">Политика обработки персональных данных</a>' : ''}</div><p>© ${new Date().getFullYear()} СкладПромо. Все права защищены.</p></footer>`;
  }

  // Блок «Склад и самовывоз» на главной — фото, адрес, график, условия
  // прохода. Рендерится только когда есть хотя бы один факт для показа
  // (адрес или фото): пустая секция с одним заголовком хуже её отсутствия.
  function warehouseHtml(company = {}) {
    const hasAddress = Boolean(company.warehouse_address);
    const photos = Array.isArray(company.photos) ? company.photos : [];
    if (!hasAddress && !photos.length) return '';

    const hoursText = (company.working_days?.length && company.working_hours_from && company.working_hours_to)
      ? `${workingDaysText(company.working_days)}: ${company.working_hours_from}–${company.working_hours_to}`
      : '';
    const addressText = hasAddress
      ? [company.warehouse_city, company.warehouse_address].filter(Boolean).join(', ')
      : '';
    const hasCoords = Boolean(company.warehouse_lat && company.warehouse_lng);
    const mapLink = hasCoords
      ? `<a href="https://yandex.ru/maps/?pt=${encodeURIComponent(company.warehouse_lng)},${encodeURIComponent(company.warehouse_lat)}&z=16&l=map" target="_blank" rel="noopener">Показать на карте</a>`
      : '';
    // Встроенная карта — публичный виджет Яндекс.Карт (map-widget), ключ API
    // не нужен. Рендерится только когда есть координаты — сейчас пусто
    // (warehouse_lat/lng), появится сама после заполнения в админке.
    const mapEmbed = hasCoords
      ? `<div class="warehouse-map"><iframe src="https://yandex.ru/map-widget/v1/?ll=${encodeURIComponent(company.warehouse_lng)}%2C${encodeURIComponent(company.warehouse_lat)}&z=16&pt=${encodeURIComponent(company.warehouse_lng)}%2C${encodeURIComponent(company.warehouse_lat)}%2Cpm2rdm" width="100%" height="320" frameborder="0" loading="lazy" title="Склад ${escH(company.legal_name || 'СкладПромо')} на карте"></iframe></div>`
      : '';
    const gallery = photos.length
      ? `<div class="warehouse-gallery">${photos.map(src => `<img src="/${escH(src)}" alt="Склад СкладПромо" loading="lazy">`).join('')}</div>`
      : '';

    return `<section class="warehouse" aria-labelledby="warehouse-heading">
  <h2 id="warehouse-heading">Склад и самовывоз</h2>
  ${gallery}
  ${addressText ? `<p class="warehouse-address">${escH(addressText)}${mapLink ? ` — ${mapLink}` : ''}</p>` : ''}
  ${hoursText ? `<p class="warehouse-hours">Часы работы: ${escH(hoursText)}</p>` : ''}
  ${company.pickup_terms ? `<p class="warehouse-terms">${escH(company.pickup_terms)}</p>` : ''}
  ${mapEmbed}
</section>`;
  }

  function headerHtml(contacts = {}) {
    const phone = validPhone(contacts.phone);
    const socialLinks = socialLinksFor(contacts);
    // Поиск здесь ведёт на главную с ?q=... — там его подхватывает shop.js
    // (initSearchFromQuery) и прогоняет через уже существующий клиентский
    // фильтр каталога. Отдельную серверную поисковую выдачу не строим —
    // на PDP/категории/распродаже нет своего товарного грида, который можно
    // было бы отфильтровать на месте (было: поиска тут не было вообще —
    // замечание дизайн-жюри, «критичный канал навигации отсутствует»).
    return `<header class="site-header">
  <div class="header-inner">
    <a href="/" class="logo">Склад<span>Промо</span></a>
    <form class="header-search" action="/" method="get" role="search">
      <label class="visually-hidden" for="header-search-input">Поиск по каталогу</label>
      <input type="search" id="header-search-input" name="q" placeholder="Поиск по названию или артикулу…" autocomplete="off">
      <button type="submit" aria-label="Найти"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button>
    </form>
    <div class="header-contacts" style="margin-left:auto">
      ${phone ? `<a href="tel:+${escH(phone.replace(/\D/g, ''))}" class="header-phone">${escH(phone)}</a>` : ''}
      ${socialLinksHtml(socialLinks, 'messenger-links')}
      <button class="cart-btn" id="cart-btn" aria-label="Корзина"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1.2 11a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span class="cart-badge" id="cart-badge">0</span></button>
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
    // «Можно ли купить оптом?» сюда намеренно не добавляется — вопрос
    // дублировал бы отдельную секцию «Оптовые условия» ниже на странице
    // (та же CTA, тот же ответ), это и создавало шаблонное ощущение
    // одинакового FAQ на каждой карточке (замечание дизайн-жюри).
    const questions = [
      {
        question: `Есть ли ${name} в наличии?`,
        // formatStockDate уже отдаёт дату с точкой («8 сентября 2026 г.») —
        // вторую точку в конце предложения не добавляем (был баг «г..»).
        answer: stock > 0
          ? `Да, на складе ${stock} шт.${updated ? ` Остаток обновлён ${updated}` : ''}`
          : `Сейчас товара нет в наличии.${updated ? ` Остаток обновлён ${updated}` : ''}`,
      },
    ];
    if (details) {
      questions.push({
        // Название товара в кавычках остаётся в исходном виде («Брелок...»,
        // а не «у Брелка...») — склонять произвольные названия из каталога
        // без морфологической библиотеки нельзя, не рискуя ошибкой падежа
        // на части из 65 карточек (была ошибка: жюри поймало «у Брелок...»).
        question: `Какие характеристики у товара «${name}»?`,
        answer: `В карточке указаны: ${details}.`,
      });
    }
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
  <a href="/product/${encodeURIComponent(productSlug(product))}" class="seo-card-image" aria-label="${escH(productName(product))}">${image ? `<img src="/${escH(String(image).replace(/^\//, ''))}" alt="${escH(productName(product))}" loading="lazy">` : '<span>Нет фото</span>'}<span class="visually-hidden">${escH(productName(product))}</span></a>
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
  <div class="catalog-products-grid">${related.map(item => categoryProductCardHtml(item)).join('')}</div>
</section>`;
  }

  function productOverviewHtml(product, products) {
    const categoryName = product.category_name || product.category || 'Каталог';
    const categoryItems = products.filter(item => item.visible && item.category_slug === product.category_slug);
    const stock = quantity(product);
    const details = characteristics(product)
      .filter(([key]) => !['Артикул', 'Категория'].includes(key))
      .map(([key, value]) => `${key.toLowerCase()} — ${value}`);
    const related = categoryItems.filter(item => item.article !== product.article).slice(0, 3);
    const detailsText = details.length
      ? `Подтверждённые характеристики: ${details.join('; ')}.`
      : 'В каталоге пока нет дополнительных подтверждённых характеристик этой модели.';
    const stockText = stock > 0
      ? `Сейчас указано ${priceText(stock)} шт. в наличии по цене ${priceText(retailPrice(product))} ₽ за штуку.`
      : `Сейчас товар отмечен как отсутствующий в наличии; указанная цена — ${priceText(retailPrice(product))} ₽.`;
    const compare = related.length
      ? `<p>Для сравнения посмотрите ${related.map(item => `<a href="/product/${encodeURIComponent(productSlug(item))}">${escH(productName(item))}</a>`).join(', ')} в этом же разделе.</p>`
      : '';
    const sourceDescription = product.description ? `<p>${escH(product.description)}</p>` : '';
    return `<section class="product-description product-overview" aria-labelledby="description-heading">
  <h2 id="description-heading">О товаре</h2>
  ${sourceDescription}
  <p>${escH(productName(product))} — товар из раздела <a href="/category/${encodeURIComponent(product.category_slug)}">${escH(categoryName)}</a>. ${escH(detailsText)} ${escH(stockText)}</p>
  <p>При заявке укажите артикул ${escH(product.article)} — так менеджер точно определит товар. Оптовую цену и условия менеджер подтверждает по запросу.</p>
  ${compare}
</section>`;
  }

  // Чекбокс согласия (152-ФЗ) сознательно НЕ отмечен по умолчанию: согласие
  // должно быть активным действием пользователя, предзаполненная галочка
  // согласием не считается. Рендерится вместе со ссылкой на политику, а
  // политика существует только когда заполнено юрлицо (см. роут /privacy).
  function privacyConsentHtml(company = {}, id = 'co-privacy') {
    if (!company.legal_name) return '';
    return `<label class="privacy-consent"><input type="checkbox" id="${escH(id)}" required><span>Я согласен на обработку персональных данных в соответствии с <a href="/privacy" target="_blank" rel="noopener">Политикой</a></span></label>`;
  }

  // DEV-07 бэклога. ТЗ предлагало выводить технологию нанесения, подобранную
  // по полю material (металл → гравировка и т.п.), и срок «3–5 рабочих дней
  // через сертифицированное производство в СПб» — одинаково для всех товаров.
  // Так делать нельзя: в данных под это заведены отдельные поля
  // (logo_service_methods / lead_time / min_qty), и они пустые, а
  // logo_service_available у всех 69 SKU = false. Материал товара не
  // определяет, что именно умеет производство, — это разные факты.
  // Поэтому блок собирается только из заполненных полей и только для тех
  // товаров, у которых услуга включена в админке.
  function brandingGuideHtml(product) {
    if (!product.logo_service_available) return '';
    const methods = String(product.logo_service_methods || '')
      .split(',').map(part => part.trim()).filter(Boolean);
    const leadTime = String(product.logo_service_lead_time || '').trim();
    const minQty = Number(product.logo_service_min_qty) || 0;
    const facts = [
      methods.length ? `<div class="branding-fact"><dt>Способы нанесения</dt><dd>${methods.map(m => `<span class="branding-method">${escH(m)}</span>`).join('')}</dd></div>` : '',
      leadTime ? `<div class="branding-fact"><dt>Срок изготовления</dt><dd>${escH(leadTime)}</dd></div>` : '',
      minQty ? `<div class="branding-fact"><dt>Минимальный тираж</dt><dd>${priceText(minQty)} шт.</dd></div>` : '',
    ].filter(Boolean).join('');
    return `<section class="product-branding" aria-labelledby="branding-heading">
  <h2 id="branding-heading">Нанесение логотипа</h2>
  ${facts ? `<dl class="branding-facts">${facts}</dl>` : ''}
  <p class="branding-note">Макет и точную стоимость нанесения менеджер согласует по запросу — оставьте заявку кнопкой «Запросить оптовые условия».</p>
</section>`;
  }

  // Оптовая сетка (P0-3 бэклога). Скидки 10% от 10 шт. и 20% от 50 шт.
  // подтверждены владельцем как действующая политика — в данных их нет
  // (wholesale_price_from у всех SKU равен рознице), поэтому считаем от
  // розничной цены по подтверждённой формуле.
  //
  // Важно: ни на одной цене тиража нет itemprop — в Offer/JSON-LD и в фиды
  // уходит только розничная цена за штуку. Иначе Merchant и Яндекс получили
  // бы у одного товара несколько разных цен, а verify-seo.js — расхождение
  // паритета HTML/JSON-LD/llms.txt/API.
  const WHOLESALE_TIERS = [
    { from: 10, to: 49, discount: 0.10 },
    { from: 50, to: null, discount: 0.20 },
  ];

  function wholesaleTierHtml(price) {
    const base = Number(price) || 0;
    if (base <= 0) return '';
    const cols = WHOLESALE_TIERS.map(tier => {
      const value = Math.round(base * (1 - tier.discount));
      const qtyText = tier.to ? `${tier.from}–${tier.to} шт.` : `от ${tier.from} шт.`;
      return `<div class="tier-col">
        <span class="tier-qty">${escH(qtyText)}</span>
        <span class="tier-price">${priceText(value)} ₽</span>
        <span class="tier-label">−${Math.round(tier.discount * 100)}%</span>
      </div>`;
    }).join('');
    return `<div class="wholesale-tiers" aria-label="Цена в зависимости от тиража">
      <div class="tier-col active">
        <span class="tier-qty">1–${WHOLESALE_TIERS[0].from - 1} шт.</span>
        <span class="tier-price">${priceText(base)} ₽</span>
        <span class="tier-label">розница</span>
      </div>
      ${cols}
    </div>`;
  }

  function cartHtml(company = {}) {
    return `<div class="cart-overlay" id="cart-overlay"></div>
<div class="cart-drawer" id="cart-drawer" aria-label="Корзина">
  <div class="cart-header"><span>Корзина</span><button class="cart-close" id="cart-close" aria-label="Закрыть">✕</button></div>
  <div class="cart-items" id="cart-items"><p class="cart-empty">Корзина пуста</p></div>
  <div class="cart-footer" id="cart-footer" style="display:none">
    <div class="cart-total"><span>Итого:</span><span id="cart-total-val">0 ₽</span></div>
    <div class="checkout-form" id="checkout-form"><label class="visually-hidden" for="co-name">Ваше имя</label><input type="text" id="co-name" placeholder="Ваше имя *" required><label class="visually-hidden" for="co-phone">Телефон</label><input type="tel" id="co-phone" placeholder="+7XXXXXXXXXX" required pattern="\\+7\\d{10}" maxlength="12" inputmode="tel" title="Введите номер в формате +7XXXXXXXXXX"><label class="visually-hidden" for="co-comment">Комментарий к заказу</label><textarea id="co-comment" placeholder="Комментарий к заказу"></textarea>${privacyConsentHtml(company)}<button class="order-btn" id="order-btn">Оформить заказ</button></div>
    <div class="order-success" id="order-success"><h3><svg class="order-success-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12.5 2.5 2.5L16 9"/></svg> Заказ принят!</h3><p id="order-success-text">Мы свяжемся с вами в ближайшее время.</p><button class="add-to-cart-btn" id="order-new-btn" style="margin-top:12px">Продолжить покупки</button></div>
  </div>
</div>
<div class="modal-overlay" id="video-modal" role="dialog" aria-modal="true"><div class="modal-box"><button class="modal-close" id="modal-close" aria-label="Закрыть">✕</button><video id="modal-video" controls playsinline></video></div></div>
<div class="modal-overlay" id="photo-zoom-modal" role="dialog" aria-modal="true" aria-label="Просмотр фото"><div class="modal-box"><button class="modal-close" id="zoom-modal-close" aria-label="Закрыть">✕</button><img id="modal-zoom-img" alt=""></div></div>`;
  }

  function productPageHtml(product, products, contacts, company = {}) {
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
        seller: {
          '@type': 'Organization',
          '@id': `${cleanSiteUrl}/#organization`,
          name: 'СкладПромо',
          url: `${cleanSiteUrl}/`,
        },
      },
    };
    productLd.brand = { '@type': 'Brand', name: brandName(product) };
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
    const attrs = characteristics(product);
    const additionalProperty = attrs.filter(([key]) => !['Артикул', 'Категория'].includes(key))
      .map(([name, value]) => ({ '@type': 'PropertyValue', name, value: String(value) }));
    if (additionalProperty.length) productLd.additionalProperty = additionalProperty;
    const updatedTimeHtml = stockUpdatedTimeHtml(product);
    const image = product.image || (product.image_urls && product.image_urls[0]);
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
  ${faviconHtml()}${revealNoscriptHtml()}
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/product.css">
  <link rel="stylesheet" href="/css/catalog.css">
  ${analyticsHtml()}
</head>
<body class="product-page-body">
${headerHtml(contacts)}
<main class="product-page-main">
  <div class="product-page-wrap">
    <nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><a href="/catalog">Каталог</a><span class="bc-sep">›</span><a href="/category/${encodeURIComponent(product.category_slug)}">${escH(categoryName)}</a><span class="bc-sep">›</span><span>${escH(productName(product))}</span></nav>
    <article class="product-detail" itemscope itemtype="https://schema.org/Product">
      ${image
        ? `<figure class="product-detail-media"><button type="button" class="pdp-img-frame pdp-zoom-trigger" id="pdp-zoom-trigger" data-full="/${escH(String(image).replace(/^\//, ''))}" aria-label="Открыть фото на весь экран"><img src="/${escH(String(image).replace(/^\//, ''))}" alt="${escH(productName(product))}" class="product-detail-img" itemprop="image"><span class="pdp-zoom-hint" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/></svg></span></button>${product.video_url || product.video ? `<button class="card-video-btn" id="video-btn" data-video="/${escH(String(product.video_url || product.video).replace(/^\//, ''))}">▶ Видео</button>` : ''}<figcaption class="visually-hidden">${escH(productName(product))}, арт. ${escH(product.article)}</figcaption></figure>`
        : `<div class="product-detail-media"><div class="product-detail-no-img">Нет фото</div>${product.video_url || product.video ? `<button class="card-video-btn" id="video-btn" data-video="/${escH(String(product.video_url || product.video).replace(/^\//, ''))}">▶ Видео</button>` : ''}</div>`}
      <div class="product-detail-info">
        <div class="pdp-meta-row">
          <span class="product-detail-article">Арт. <span itemprop="sku">${escH(product.article)}</span></span>
          <a href="/category/${encodeURIComponent(product.category_slug)}" class="pdp-cat-tag">${escH(categoryName)}</a>
        </div>
        <h1 class="product-detail-name" itemprop="name">${escH(productName(product))}</h1>
        <div class="product-detail-prices" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="priceCurrency" content="RUB"><link itemprop="availability" href="${stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'}">
          ${sale ? `<p class="pdp-old-price">${priceText(product.old_price)} ₽</p><p class="pdp-sale-note">Скидка ${escH(product.discount_percent)}%. ${escH(product.sale_terms)}</p>` : ''}
          <div class="pdp-prices-main"><p class="pdp-price pdp-retail"><data class="pdp-val" itemprop="price" value="${price}">${priceText(price)} ₽</data></p></div>
          ${wholesaleTierHtml(price)}
          <p class="pdp-opt-note">Цена за штуку. Точную стоимость тиража и условия менеджер подтверждает при оформлении.</p>
        </div>
        <!-- formatStockDate уже отдаёт дату с точкой («8 сентября 2026 г.») — вторую точку не добавляем (был баг «г..», см. faqFor). -->
        <p class="product-detail-qty ${stock > 0 ? 'in-stock' : 'out-stock'}">${stock > 0 ? `В наличии: ${escH(String(stock))} шт.${updatedTimeHtml ? ` Остаток обновлён ${updatedTimeHtml}` : ''}` : `Нет в наличии${updatedTimeHtml ? `. Остаток обновлён ${updatedTimeHtml}` : ''}`}</p>
        <div class="pdp-trust-pills">
          <span class="pdp-trust-pill"><span class="pdp-trust-dot"></span>Склад в Санкт-Петербурге</span>
          <span class="pdp-trust-pill"><span class="pdp-trust-dot"></span>Опт и розница</span>
        </div>
        <p class="product-factual-summary" itemprop="description">${escH(description)}</p>
        <div class="pdp-action-wrapper">
          <div class="pdp-qty-and-cart">
            ${stock > 0 ? `
            <div class="pdp-qty-picker">
              <button type="button" class="pdp-qty-btn" id="pdp-qty-dec" aria-label="Уменьшить количество">−</button>
              <input type="number" id="pdp-qty-val" class="pdp-qty-input" value="1" min="1" max="${stock}" readonly>
              <button type="button" class="pdp-qty-btn" id="pdp-qty-inc" aria-label="Увеличить количество">+</button>
            </div>
            <button class="add-to-cart-btn" id="add-btn" data-article="${escH(product.article)}">В корзину</button>
            ` : ''}
            <button type="button" class="wholesale-btn" id="wholesale-btn">Запросить оптовые условия</button>
          </div>
        </div>
      </div>
    </article>
    ${factsHtml(product)}
    ${attrs.length ? `<section class="product-characteristics" aria-labelledby="characteristics-heading"><h2 id="characteristics-heading">Характеристики</h2><table class="product-attrs"><caption class="visually-hidden">Характеристики товара «${escH(productName(product))}»</caption><thead><tr><th scope="col">Параметр</th><th scope="col">Значение</th></tr></thead><tbody>${attrs.map(([key, value]) => `<tr><th scope="row">${escH(key)}</th><td>${escH(value)}</td></tr>`).join('')}</tbody></table></section>` : ''}
    ${brandingGuideHtml(product)}
    ${productOverviewHtml(product, products)}
    <section class="product-wholesale" id="wholesale-request" aria-labelledby="wholesale-heading"><h2 id="wholesale-heading">Оптовые условия</h2><p>Оставьте номер телефона — менеджер подтвердит цену и условия для этой модели.</p><form id="wholesale-form"><fieldset><legend class="visually-hidden">Заявка на оптовые условия</legend><label class="visually-hidden" for="wholesale-name">Ваше имя</label><input id="wholesale-name" name="name" required placeholder="Ваше имя"><label class="visually-hidden" for="wholesale-contact">Телефон</label><input id="wholesale-contact" type="tel" name="contact" required placeholder="+7XXXXXXXXXX" pattern="\\+7\\d{10}" maxlength="12" inputmode="tel" title="Введите номер в формате +7XXXXXXXXXX"><label class="visually-hidden" for="wholesale-comment">Количество и комментарий</label><textarea id="wholesale-comment" name="comment" placeholder="Количество и комментарий"></textarea>${privacyConsentHtml(company, 'wholesale-privacy')}<button type="submit" class="wholesale-btn">Отправить запрос</button><p id="wholesale-status" aria-live="polite"></p></fieldset></form></section>
    ${faqHtml(faq)}
    ${relatedHtml(product, products)}
  </div>
</main>
<aside class="pdp-sticky-bar" id="pdp-sticky-bar" aria-label="Быстрый заказ">
  <div class="pdp-sticky-info">
    <span class="pdp-sticky-title">${escH(productName(product))}</span>
    <span class="pdp-sticky-price">${priceText(price)} ₽</span>
  </div>
  ${stock > 0 ? `<button type="button" class="pdp-sticky-btn" id="pdp-sticky-add-btn">В корзину</button>` : `<a href="#wholesale-request" class="pdp-sticky-btn">Опт запрос</a>`}
</aside>
${footerHtml(contacts, company)}
${cartHtml(company)}
<script>window.PRODUCT_DATA=${jsonForScript({ article: product.article, name: productName(product), price, qty: stock, image: image ? `/${String(image).replace(/^\//, '')}` : '' })};</script>
<script src="/js/product.js"></script>
<script>document.getElementById('wholesale-btn')?.addEventListener('click',()=>document.getElementById('wholesale-request').scrollIntoView({behavior:'smooth'}));document.getElementById('wholesale-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const status=document.getElementById('wholesale-status');const data=Object.fromEntries(new FormData(form));try{const response=await fetch('/api/wholesale-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article:${jsonForScript(String(product.article))},...data})});if(!response.ok)throw new Error();form.reset();status.textContent='Запрос принят.';window.skladTrack?.('generate_lead',{lead_type:'wholesale',item_id:${jsonForScript(String(product.article))}});}catch{status.textContent='Не удалось отправить запрос. Попробуйте ещё раз.';}});</script>
</body>
</html>`;
  }

  function categoryProductCardHtml(product) {
    const stock = quantity(product);
    const price = retailPrice(product);
    const image = product.image || (product.image_urls && product.image_urls[0]);
    const isSale = isValidSale(product);
    const imgSrc = image ? `/${escH(String(image).replace(/^\//, ''))}` : '';
    const pName = productName(product);
    const pSlug = productSlug(product);
    const pUrl = `/product/${encodeURIComponent(pSlug)}`;
    const material = String(product.material || '').trim();
    const color = String(product.color || '').trim();

    return `<article class="catalog-card" data-article="${escH(product.article)}" data-name="${escH(pName.toLowerCase())}">
      <div class="catalog-card-media">
        <a href="${pUrl}" class="catalog-card-img-link" aria-label="${escH(pName)}">
          ${imgSrc ? `<img src="${imgSrc}" alt="${escH(pName)}" loading="lazy" class="catalog-card-img">` : `<div class="catalog-card-no-img">Нет фото</div>`}
          <span class="visually-hidden">${escH(pName)}</span>
        </a>
        <div class="catalog-card-badges">
          ${isSale ? `<span class="catalog-badge-sale">−${escH(product.discount_percent)}%</span>` : ''}
          <span class="catalog-badge-art">Арт. ${escH(product.article)}</span>
        </div>
        ${photoCountBadgeHtml(product)}
      </div>
      <div class="catalog-card-content">
        ${(material || color) ? `<div class="catalog-card-meta-row">${material ? `<span class="card-tag">${escH(material)}</span>` : ''}${color ? `<span class="card-tag">${escH(color)}</span>` : ''}</div>` : ''}
        <h3 class="catalog-card-title"><a href="${pUrl}">${escH(pName)}</a></h3>
        <div class="catalog-card-pricing">
          ${isSale ? `<span class="catalog-card-old-price">${priceText(product.old_price)} ₽</span>` : ''}
          <span class="catalog-card-price">${priceText(price)} ₽</span>
          <span class="catalog-card-opt-hint">Опт по запросу</span>
        </div>
        <div class="catalog-card-stock ${stock > 0 ? 'in-stock' : 'out-stock'}">
          <span class="stock-dot"></span>
          <span>${stock > 0 ? `В наличии: ${stock} шт.` : 'Под заказ'}</span>
        </div>
        <div class="catalog-card-actions">
          ${stock > 0 ? `<button type="button" class="catalog-add-cart-btn" data-article="${escH(product.article)}" data-name="${escH(pName)}" data-price="${price}" data-qty="${stock}" data-image="${imgSrc}">В корзину</button>` : `<a href="${pUrl}" class="catalog-order-btn">Подробнее</a>`}
          <a href="${pUrl}" class="catalog-detail-link" aria-label="Подробнее о ${escH(pName)}">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>
      </div>
    </article>`;
  }

  // Как и в catalogB2bBannerHtml выше (см. комментарий там) — никаких
  // выдуманных тиражей, услуги нанесения логотипа или конкретных способов
  // брендирования: logo_service_available нигде не подтверждён. Телефон и
  // Telegram берутся из contacts, а не хардкодятся.
  function categoryWholesaleBannerHtml(category, contacts = {}) {
    const heading = categoryHeading(category);
    const phone = validPhone(contacts.phone);
    const telegramUrl = validUrl(contacts.telegram, ['t.me/username']);
    return `<section class="category-b2b-cta" aria-labelledby="b2b-cta-title">
      <div class="b2b-cta-inner">
        <div class="b2b-cta-text">
          <span class="b2b-pill">Для корпоративных клиентов</span>
          <h2 id="b2b-cta-title">Оптовая поставка «${escH(heading)}»</h2>
          <p>Менеджер подтвердит цену и условия поставки для нужного объёма.</p>
        </div>
        <div class="b2b-cta-actions">
          ${phone ? `<a href="tel:+${escH(phone.replace(/\D/g, ''))}" class="b2b-btn-primary">Позвонить: ${escH(phone)}</a>` : ''}
          ${telegramUrl ? `<a href="${escH(telegramUrl)}" target="_blank" rel="noopener" class="b2b-btn-secondary">Написать в Telegram</a>` : ''}
        </div>
      </div>
    </section>`;
  }

  function categorySiblingsHtml(category, allProducts = []) {
    const byCat = groupByCategory(allProducts);
    const siblings = sortedCategories(allProducts).filter(c => c.slug !== category.slug);
    const idx = sortedCategories(allProducts).findIndex(c => c.slug === category.slug);
    const near = siblings.slice(Math.max(0, idx - 2), Math.max(0, idx - 2) + 4);
    if (!near.length) return '';

    return `<section class="category-siblings-section" aria-labelledby="siblings-heading">
      <div class="siblings-head">
        <h2 id="siblings-heading" class="siblings-title">Другие категории каталога</h2>
        <a href="/catalog" class="siblings-all-link">Весь каталог товаров →</a>
      </div>
      <div class="siblings-grid">
        ${near.map(c => {
          const items = byCat.get(c.slug) || [];
          const withImg = items.find(i => i.image || (i.image_urls && i.image_urls[0]));
          const img = withImg ? (withImg.image || withImg.image_urls[0]) : '';
          const prices = items.map(retailPrice).filter(p => p > 0);
          const minPrice = prices.length ? Math.min(...prices) : 0;
          return `<a href="/category/${encodeURIComponent(c.slug)}" class="sibling-card">
            <div class="sibling-thumb">${img ? `<img src="/${escH(String(img).replace(/^\//, ''))}" alt="${escH(c.name)}" loading="lazy">` : '<span class="tile-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m21 16-9 5-9-5V8l9-5 9 5v8Z"/><path d="m3.3 8 8.7 4.8 8.7-4.8M12 12.8V21"/></svg></span>'}</div>
            <div class="sibling-info">
              <span class="sibling-name">${escH(c.name)}</span>
              <div class="sibling-meta">
                <span>${items.length} ${plural(items.length, 'товар', 'товара', 'товаров')}</span>
                ${minPrice ? `<span class="sibling-price">от ${priceText(minPrice)} ₽</span>` : ''}
              </div>
            </div>
          </a>`;
        }).join('')}
      </div>
    </section>`;
  }

  // Пилюля hero-metrics ниже раньше была "Отгрузка от 1 дня" — конкретный
  // срок доставки нигде не подтверждён (штат/график склада не задан,
  // company.pickup_terms пуст). Заменена на "Опт и розница" — ту же
  // формулировку, что уже на /catalog, про реальную модель продаж, без
  // придуманного SLA. Пояснение вынесено сюда, а не в HTML-комментарий
  // рядом с пилюлей: вся функция — одна template-строка, и любой текст
  // внутри неё, включая "<!-- -->", уходит в вывод буквально.
  function categoryPageHtml(category, products, contacts, allProducts = [], company = {}) {
    const heading = categoryHeading(category);
    const title = `${heading} — купить со склада | СкладПромо`;
    const description = categoryMetaDescription(category, products);
    const intro = categoryIntro(category, products);
    const url = categoryUrl(category.slug);
    const stats = categoryStats(products);

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
    const collectionLd = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: heading,
      url,
      description,
      isPartOf: { '@type': 'WebSite', name: 'СкладПромо', url: `${cleanSiteUrl}/` },
      mainEntity: {
        '@type': 'ItemList',
        name: heading,
        numberOfItems: products.length,
        itemListElement: listLd.itemListElement,
      },
    };

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
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escH(url)}">
  <meta property="og:site_name" content="СкладПромо">
  <script type="application/ld+json">${jsonForScript(breadcrumbLd)}</script>
  <script type="application/ld+json">${jsonForScript(listLd)}</script>
  <script type="application/ld+json">${jsonForScript(collectionLd)}</script>
  ${faviconHtml()}
  ${revealNoscriptHtml()}
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/product.css">
  <link rel="stylesheet" href="/css/catalog.css">
  <link rel="stylesheet" href="/css/category.css">
  ${analyticsHtml()}
</head>
<body class="category-page-body">
  ${headerHtml(contacts)}
  <main class="category-page-wrapper">
    <nav class="category-breadcrumb" aria-label="Навигация">
      <a href="/">Главная</a>
      <span class="category-breadcrumb-sep">›</span>
      <a href="/catalog">Каталог</a>
      <span class="category-breadcrumb-sep">›</span>
      <span class="category-breadcrumb-current">${escH(category.name)}</span>
    </nav>

    <header class="category-hero">
      <div class="category-hero-title-row">
        <h1 class="category-hero-title">${escH(heading)}</h1>
        <span class="category-hero-count">${stats.count} ${plural(stats.count, 'модель', 'модели', 'моделей')}</span>
      </div>
      <p class="category-intro">${escH(intro)}</p>

      <div class="category-hero-metrics">
        <span class="cat-metric-pill"><span class="cat-metric-dot success"></span>${priceText(stats.stock)} шт. в наличии</span>
        ${stats.min && stats.max ? `<span class="cat-metric-pill"><span class="cat-metric-dot"></span>от ${priceText(stats.min)} до ${priceText(stats.max)} ₽</span>` : ''}
        <span class="cat-metric-pill"><span class="cat-metric-dot"></span>Опт и розница</span>
        <span class="cat-metric-pill"><span class="cat-metric-dot"></span>Склад в Санкт-Петербурге</span>
      </div>
    </header>

    <section class="category-products" aria-labelledby="category-products-heading">
      <div class="category-section-head">
        <h2 id="category-products-heading" class="category-section-heading">Товары в категории</h2>
      </div>
      <div class="category-product-grid">
        ${products.map(item => categoryProductCardHtml(item)).join('')}
      </div>
    </section>

    ${categoryGuideHtml(category, products)}

    ${categoryWholesaleBannerHtml(category, contacts)}

    ${categorySiblingsHtml(category, allProducts)}
  </main>

  ${warehouseHtml(company)}
  ${footerHtml(contacts, company)}
  ${cartHtml(company)}

  <script src="/js/category.js"></script>
</body>
</html>`;
  }

  function salePageHtml(products, contacts, company = {}) {
    const title = 'Распродажа товаров со склада | СкладПромо';
    const description = 'Товары со склада с подтверждённой скидкой: старая и новая цена, размер скидки и условия акции.';
    const url = `${cleanSiteUrl}/sale`;
    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${url}">${faviconHtml()}${revealNoscriptHtml()}<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/product.css">${analyticsHtml()}</head><body>${headerHtml(contacts)}<main class="category-page"><nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><span>Распродажа</span></nav><h1>Распродажа товаров со склада</h1><div class="seo-product-grid">${products.map(item => productCardHtml(item, { sale: true })).join('')}</div></main>${footerHtml(contacts, company)}</body></html>`;
  }

  // Политика обработки ПД (152-ФЗ). Текст описывает то, что формы реально
  // собирают — имя, телефон, комментарий: почты и адреса доставки в
  // /api/order и /api/wholesale-request нет, поэтому и в политике их нет
  // (ТЗ бэклога называло их, но это расходится с кодом). Блок про счётчики
  // появляется только когда счётчик реально подключён (analyticsHtml() выше
  // рендерится по тем же переменным).
  // Дата редакции политики. Меняется только когда меняется сам текст —
  // в sitemap уходит она, а не «сегодня»: иначе документ выглядел бы
  // переписываемым каждый день (тот же принцип, что у TEMPLATE_CHANGED_AT).
  const PRIVACY_LASTMOD = '2026-09-10';
  const PRIVACY_EFFECTIVE_DATE = '10 сентября 2026 г.';

  function privacyPageHtml(contacts = {}, company = {}) {
    const title = 'Политика обработки персональных данных | СкладПромо';
    const description = 'Политика обработки персональных данных: какие данные собираются на сайте, с какой целью, сколько хранятся и как отозвать согласие.';
    const url = `${cleanSiteUrl}/privacy`;
    const phone = validPhone(contacts.phone);
    const email = contacts.email || '';

    const operatorLines = [
      company.legal_name ? `Наименование: ${company.legal_name}` : '',
      company.inn ? `ИНН: ${company.inn}` : '',
      company.kpp ? `КПП: ${company.kpp}` : '',
      company.ogrn ? `ОГРН: ${company.ogrn}` : '',
      company.legal_address ? `Адрес: ${company.legal_address}` : '',
    ].filter(Boolean);

    const counters = [GA4_ID ? 'Google Analytics' : '', YM_ID ? 'Яндекс.Метрика' : ''].filter(Boolean);

    const contactLines = [
      phone ? `<li>по телефону <a href="tel:+${escH(phone.replace(/\D/g, ''))}">${escH(phone)}</a></li>` : '',
      email ? `<li>по электронной почте <a href="mailto:${escH(email)}">${escH(email)}</a></li>` : '',
      company.legal_address ? `<li>письмом по адресу: ${escH(company.legal_address)}</li>` : '',
    ].filter(Boolean).join('');

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${cleanSiteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Политика обработки персональных данных', item: url },
      ],
    };

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
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escH(url)}">
  <script type="application/ld+json">${jsonForScript(breadcrumbLd)}</script>
  ${faviconHtml()}${revealNoscriptHtml()}
  <link rel="stylesheet" href="/css/style.css">
  ${analyticsHtml()}
</head>
<body>
${headerHtml(contacts)}
<main class="legal-page">
  <nav class="breadcrumb" aria-label="Навигация"><a href="/">Главная</a><span class="bc-sep">›</span><span>Политика обработки персональных данных</span></nav>
  <h1>Политика обработки персональных данных</h1>
  <p class="legal-date">Действует с ${escH(PRIVACY_EFFECTIVE_DATE)}</p>

  <section class="legal-section">
    <h2>1. Общие положения</h2>
    <p>Политика определяет порядок обработки персональных данных пользователей сайта ${escH(cleanSiteUrl.replace(/^https?:\/\//, ''))} и составлена в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».</p>
    ${operatorLines.length ? `<p>Оператор персональных данных:</p><ul>${operatorLines.map(line => `<li>${escH(line)}</li>`).join('')}</ul>` : ''}
    <p>Используя формы на сайте, пользователь подтверждает согласие с настоящей Политикой. Если пользователь не согласен с её условиями, ему следует воздержаться от отправки форм.</p>
  </section>

  <section class="legal-section">
    <h2>2. Какие данные обрабатываются</h2>
    <p>Оператор обрабатывает только те данные, которые пользователь сообщает добровольно через формы сайта:</p>
    <ul>
      <li><b>имя</b> — чтобы менеджер знал, к кому обращаться;</li>
      <li><b>номер телефона</b> — для связи по заказу или оптовому запросу;</li>
      <li><b>комментарий к заказу или запросу</b> — необязательное поле, заполняется пользователем на своё усмотрение.</li>
    </ul>
    <p>Сайт не запрашивает паспортные данные, адрес электронной почты, адрес доставки, банковские реквизиты физических лиц и не обрабатывает специальные и биометрические категории персональных данных.</p>
    <p>Вместе с обращением сохраняется состав заказа или артикул товара — сведения о товаре, а не о человеке.</p>
    ${counters.length ? `<p>Дополнительно сайт использует ${escH(counters.join(' и '))} — ${counters.length > 1 ? 'эти сервисы собирают' : 'этот сервис собирает'} обезличенные технические данные о посещении (IP-адрес, сведения о браузере и устройстве, источник перехода, действия на страницах) с помощью файлов cookie. Эти данные используются только для статистики посещаемости и не позволяют определить личность пользователя.</p>` : ''}
  </section>

  <section class="legal-section">
    <h2>3. Цели обработки</h2>
    <ul>
      <li>приём, подтверждение и выполнение заказа;</li>
      <li>обработка запроса оптовых условий и обратная связь по нему;</li>
      <li>согласование доставки или самовывоза;</li>
      <li>оформление документов для юридических лиц и индивидуальных предпринимателей.</li>
    </ul>
    <p>Оператор не использует персональные данные для рекламных рассылок и не принимает на их основании решений исключительно автоматизированными средствами.</p>
  </section>

  <section class="legal-section">
    <h2>4. Правовые основания</h2>
    <p>Обработка осуществляется на основании согласия пользователя, которое он даёт, отмечая соответствующий чекбокс при отправке формы, а также на основании пункта 5 части 1 статьи 6 Федерального закона № 152-ФЗ — для исполнения договора, стороной которого является пользователь.</p>
  </section>

  <section class="legal-section">
    <h2>5. Передача третьим лицам</h2>
    <p>Оператор не продаёт и не передаёт персональные данные третьим лицам, за исключением случаев, когда это необходимо для исполнения заказа:</p>
    <ul>
      <li>курьерским службам и транспортным компаниям — имя и телефон получателя, чтобы доставить заказ;</li>
      ${counters.length ? `<li>${escH(counters.join(' и '))} — обезличенные данные о посещении сайта;</li>` : ''}
      <li>государственным органам — в случаях и в объёме, предусмотренных законом.</li>
    </ul>
  </section>

  <section class="legal-section">
    <h2>6. Хранение и защита</h2>
    <p>Данные хранятся на сервере в Российской Федерации в течение срока, необходимого для выполнения заказа и соблюдения требований законодательства о бухгалтерском и налоговом учёте, но не дольше, чем этого требуют цели обработки. По достижении целей обработки или при отзыве согласия данные уничтожаются.</p>
    <p>Доступ к данным имеют только сотрудники, которым он необходим для обработки заказов. Административная панель сайта защищена паролем, передача данных ведётся по протоколу HTTPS.</p>
  </section>

  <section class="legal-section">
    <h2>7. Права пользователя и отзыв согласия</h2>
    <p>Пользователь вправе получить сведения об обработке своих персональных данных, потребовать их уточнения, блокирования или уничтожения, а также в любой момент отозвать согласие на обработку.</p>
    ${contactLines ? `<p>Для этого достаточно обратиться к оператору:</p><ul>${contactLines}</ul>` : ''}
    <p>Обращение рассматривается в срок, установленный законодательством. После отзыва согласия обработка прекращается, а данные уничтожаются, если у оператора не осталось иных законных оснований для их хранения.</p>
  </section>

  <section class="legal-section">
    <h2>8. Файлы cookie</h2>
    <p>Сайт использует файлы cookie, необходимые для работы корзины${counters.length ? ', а также cookie сервисов статистики' : ''}. Пользователь может отключить cookie в настройках браузера — при этом часть функций сайта, включая корзину, может работать некорректно.</p>
  </section>

  <section class="legal-section">
    <h2>9. Изменения политики</h2>
    <p>Оператор вправе вносить изменения в настоящую Политику. Актуальная редакция всегда доступна по адресу <a href="${escH(url)}">${escH(url)}</a>.</p>
  </section>
</main>
${footerHtml(contacts, company)}
</body>
</html>`;
  }

  function deliveryPageHtml(contacts = {}, company = {}) {
    const title = 'Доставка и оплата сувенирной продукции со склада в СПб | СкладПромо';
    const description = 'Условия доставки и оплаты сувенирной продукции: бесплатный самовывоз со склада в Санкт-Петербурге, доставка курьером по СПб и отправка по всей России (СДЭК, Яндекс Go, ТК), безналичный расчет с НДС и СБП.';
    const url = `${cleanSiteUrl}/delivery`;

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${cleanSiteUrl}/` },
        { '@type': 'ListItem', position: 2, name: 'Доставка и оплата', item: url },
      ],
    };

    const webPageLd = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Доставка и оплата сувенирной продукции',
      url,
      description,
      isPartOf: { '@type': 'WebSite', name: 'СкладПромо', url: `${cleanSiteUrl}/` },
    };

    const phone = validPhone(contacts.phone) || '+7 (812) 962-15-98';
    const email = contacts.email || 'giftsworld1@gmail.com';
    const cleanPhone = phone.replace(/\D/g, '');
    // Было захардкожено "t.me/salegifts" — чужой/несуществующий адрес,
    // настоящий берём из contacts, как везде на сайте (см. categoryWholesaleBannerHtml).
    const telegramUrl = validUrl(contacts.telegram, ['t.me/username']);
    // P2: кнопка копирования реквизитов. Те же поля и то же условие
    // (есть legal_name), что в requisitesHtml() — но plain text для
    // вставки в 1С/банк-клиент, а не HTML с <br>.
    const requisitesPlainText = company.legal_name ? [
      company.legal_name,
      company.inn ? `ИНН ${company.inn}` : '',
      company.kpp ? `КПП ${company.kpp}` : '',
      company.ogrn ? `ОГРН ${company.ogrn}` : '',
      company.legal_address ? `Юр. адрес: ${company.legal_address}` : '',
      company.bank_name ? `Банк: ${company.bank_name}` : '',
      company.bank_account ? `Р/с ${company.bank_account}` : '',
      company.bank_corr_account ? `К/с ${company.bank_corr_account}` : '',
      company.bank_bik ? `БИК ${company.bank_bik}` : '',
    ].filter(Boolean).join('\n') : '';

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
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escH(url)}">
  <meta property="og:site_name" content="СкладПромо">
  <script type="application/ld+json">${jsonForScript(breadcrumbLd)}</script>
  <script type="application/ld+json">${jsonForScript(webPageLd)}</script>
  ${faviconHtml()}
  ${revealNoscriptHtml()}
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/delivery.css">
  ${analyticsHtml()}
</head>
<body class="delivery-page-body">
  ${headerHtml(contacts)}
  <main class="delivery-page-wrapper">
    <nav class="delivery-breadcrumb" aria-label="Навигация">
      <a href="/">Главная</a>
      <span class="delivery-breadcrumb-sep">›</span>
      <span class="delivery-breadcrumb-current">Доставка и оплата</span>
    </nav>

    <header class="delivery-hero">
      <h1 class="delivery-hero-title">Доставка и оплата</h1>
      <p class="delivery-hero-desc">Отгружаем сувенирную продукцию и корпоративные подарки со склада в Санкт-Петербурге. Заказ можно забрать самостоятельно, оформить доставку курьером до офиса или отправить партию в любой город России.</p>

      <div class="delivery-hero-metrics">
        <span class="delivery-metric-pill"><span class="delivery-metric-dot success"></span>Самовывоз бесплатно от 1 шт.</span>
        <span class="delivery-metric-pill"><span class="delivery-metric-dot success"></span>По СПб бесплатно от 10 000 ₽</span>
        <span class="delivery-metric-pill"><span class="delivery-metric-dot"></span>По всей РФ: СДЭК, Яндекс, ТК</span>
        <span class="delivery-metric-pill"><span class="delivery-metric-dot"></span>Безнал с НДС и по QR-коду (СБП)</span>
        <span class="delivery-metric-pill"><span class="delivery-metric-dot"></span>ЭДО: Диадок и СБИС</span>
      </div>
    </header>

    <nav class="delivery-sticky-nav" aria-label="Разделы доставки и оплаты">
      <div class="delivery-nav-inner">
        <button type="button" class="delivery-nav-pill active" data-target="summary">Главные условия</button>
        <button type="button" class="delivery-nav-pill" data-target="spb">1. Доставка по СПб</button>
        <button type="button" class="delivery-nav-pill" data-target="pickup">2. Самовывоз со склада</button>
        <button type="button" class="delivery-nav-pill" data-target="russia">3. Доставка по России</button>
        <button type="button" class="delivery-nav-pill" data-target="payment">4. Способы оплаты</button>
        <button type="button" class="delivery-nav-pill" data-target="documents">5. Документы и гарантии</button>
        <button type="button" class="delivery-nav-pill" data-target="logistics">Контакты отдела логистики</button>
      </div>
    </nav>

    <!-- СЕКЦИЯ: ГЛАВНЫЕ УСЛОВИЯ КОРОТКО -->
    <section class="delivery-summary-section" id="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" class="delivery-section-title">Главные условия коротко</h2>
      <div class="summary-cards-grid">
        <div class="summary-card">
          <div class="summary-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          </div>
          <span class="summary-card-label">Самовывоз</span>
          <strong class="summary-card-title">Бесплатно от 1 шт.</strong>
          <p class="summary-card-text">Со склада на Гражданском проспекте, д. 118, к. 1 в Санкт-Петербурге.</p>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <span class="summary-card-label">По Санкт-Петербургу</span>
          <strong class="summary-card-title">Бесплатно от 10 000 ₽</strong>
          <p class="summary-card-text">При заказе до 10 000 ₽ — курьером по фактическому тарифу Яндекс Go без наценок.</p>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <span class="summary-card-label">По всей России</span>
          <strong class="summary-card-title">Яндекс, Авито и ТК</strong>
          <p class="summary-card-text">Отправка через Деловые Линии, СДЭК, ПЭК, Яндекс Доставку или любую ТК на ваш выбор.</p>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <span class="summary-card-label">Оплата</span>
          <strong class="summary-card-title">Безнал и QR (СБП)</strong>
          <p class="summary-card-text">Безналичный расчет по счету с НДС для юрлиц и ИП либо быстрая оплата по QR-коду.</p>
        </div>

        <div class="summary-card">
          <div class="summary-card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <span class="summary-card-label">Документы</span>
          <strong class="summary-card-title">УПД, Диадок, СБИС</strong>
          <p class="summary-card-text">ЭДО день в день либо оригиналы закрывающих документов с синей печатью в коробке с заказом.</p>
        </div>
      </div>
    </section>

    <!-- СЕКЦИЯ 1: ДОСТАВКА ПО СПБ -->
    <section class="delivery-content-block" id="spb" aria-labelledby="spb-title">
      <div class="delivery-block-header">
        <span class="delivery-badge">Курьерская доставка</span>
        <h2 id="spb-title" class="delivery-section-title">1. Доставка по Санкт-Петербургу</h2>
        <p class="delivery-block-desc">Доставляем заказы по городу в пределах КАД по рабочим дням.</p>
      </div>

      <div class="conditions-two-col">
        <div class="condition-card highlight">
          <span class="condition-tag free">Бесплатно</span>
          <h3 class="condition-title">Заказ от 10 000 ₽</h3>
          <p class="condition-desc">Доставка бесплатная в пределах КАД. Заказ привозит курьерская служба прямо до вашего офиса или склада.</p>
        </div>
        <div class="condition-card">
          <span class="condition-tag">По тарифу сервиса</span>
          <h3 class="condition-title">Заказ до 10 000 ₽</h3>
          <p class="condition-desc">Отправляем курьерской службой Яндекс Go. Вы оплачиваете только фактический тариф сервиса на момент отправки, без дополнительных комиссий и наценок.</p>
        </div>
      </div>

      <div class="steps-container">
        <h3 class="steps-title">Как проходит отправка</h3>
        <div class="steps-grid">
          <div class="step-box">
            <div class="step-num">1</div>
            <p class="step-text">Менеджер сообщает вам о готовности тиража на складе.</p>
          </div>
          <div class="step-box">
            <div class="step-num">2</div>
            <p class="step-text">Согласуем удобный день, интервал времени и телефон контактного лица, которое примет коробки.</p>
          </div>
          <div class="step-box">
            <div class="step-num">3</div>
            <p class="step-text">Перед выездом курьер связывается с получателем.</p>
          </div>
        </div>
      </div>

      <div class="info-callout">
        Если требуется доставка за пределы КАД или в города Ленинградской области (Петергоф, Пушкин, Сестрорецк, Кронштадт), менеджер рассчитает стоимость поездки при согласовании заказа.
      </div>
    </section>

    <!-- СЕКЦИЯ 2: САМОВЫВОЗ СО СКЛАДА -->
    <section class="delivery-content-block" id="pickup" aria-labelledby="pickup-title">
      <div class="delivery-block-header">
        <span class="delivery-badge">Собственный склад</span>
        <h2 id="pickup-title" class="delivery-section-title">2. Самовывоз со склада</h2>
        <p class="delivery-block-desc">Забрать готовый заказ можно самостоятельно. Это бесплатно для тиражей любого объема и стоимости.</p>
      </div>

      <div class="warehouse-info-card">
        <div class="wh-info-item">
          <strong>Адрес склада</strong>
          <p>Санкт-Петербург, Гражданский пр., д. 118, корп. 1</p>
          <span>метро «Гражданский проспект»</span>
        </div>
        <div class="wh-info-item">
          <strong>График выдачи</strong>
          <p>Понедельник — пятница, с 10:00 до 18:00</p>
          <span>Суббота и воскресенье — выходные дни</span>
        </div>
      </div>

      <div class="steps-container">
        <h3 class="steps-title">Порядок получения</h3>
        <div class="steps-grid">
          <div class="step-box">
            <div class="step-num">1</div>
            <p class="step-text">Предупредите менеджера за пару часов до приезда, чтобы кладовщики успели скомплектовать заказ и распечатать документы.</p>
          </div>
          <div class="step-box">
            <div class="step-num">2</div>
            <p class="step-text"><strong>Для юрлиц и ИП:</strong> представитель компании должен иметь при себе паспорт и оригинал доверенности (типовая форма М-2) либо круглую печать организации при наличии права подписи.</p>
          </div>
          <div class="step-box">
            <div class="step-num">3</div>
            <p class="step-text">На складе можно спокойно вскрыть упаковку, проверить цвет, качество нанесения и пересчитать количество позиций.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- СЕКЦИЯ 3: ДОСТАВКА ПО РОССИИ -->
    <section class="delivery-content-block" id="russia" aria-labelledby="russia-title">
      <div class="delivery-block-header">
        <span class="delivery-badge">Регионы РФ</span>
        <h2 id="russia-title" class="delivery-section-title">3. Доставка по России</h2>
        <p class="delivery-block-desc">Работаем со всеми регионами страны. Способ отправки выбираете вы в зависимости от объема партии, срочности и бюджета.</p>
      </div>

      <div class="conditions-two-col">
        <div class="condition-card">
          <span class="condition-tag">Срочные заказы и образцы</span>
          <h3 class="condition-title">Быстрая доставка: Яндекс Доставка и Авито Доставка</h3>
          <p class="condition-desc">Оптимально для небольших тиражей, единичных образцов продукции и срочных заказов.</p>
          <ul style="margin: 8px 0 0 18px; line-height: 1.55; font-size: 0.92rem; color: var(--charcoal);">
            <li>Доставка до ближайшего пункта выдачи заказов (ПВЗ) или прямо в руки курьером.</li>
            <li>Отслеживание по трек-номеру на каждом этапе пути.</li>
            <li>Быстрое оформление через приложения сервисов.</li>
          </ul>
        </div>

        <div class="condition-card">
          <span class="condition-tag">Объемные и сборные грузы</span>
          <h3 class="condition-title">Транспортные компании</h3>
          <p class="condition-desc">Для объемных, тяжелых и паллетных грузов сотрудничаем с надежными перевозчиками:</p>
          <div class="carrier-tags-grid">
            <span class="carrier-tag">«Деловые Линии»</span>
            <span class="carrier-tag">СДЭК</span>
            <span class="carrier-tag">ПЭК</span>
            <span class="carrier-tag">«Байкал Сервис»</span>
            <span class="carrier-tag">«Возовоз»</span>
          </div>
          <p class="condition-desc" style="font-size: 0.88rem; color: var(--mute);">А также любая другая транспортная компания с терминалом в Санкт-Петербурге по вашему желанию.</p>
        </div>
      </div>

      <div class="bullet-features-list">
        <div class="feature-check-item">
          <div class="feature-check-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p class="feature-check-text"><strong>Бесплатный подвоз к терминалу:</strong> до терминала выбранной ТК в Санкт-Петербурге довозим заказ бесплатно.</p>
        </div>
        <div class="feature-check-item">
          <div class="feature-check-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p class="feature-check-text"><strong>Оплата по тарифам ТК:</strong> межтерминальную перевозку и экспедирование до двери в вашем городе вы оплачиваете напрямую транспортной компании при получении груза.</p>
        </div>
        <div class="feature-check-item">
          <div class="feature-check-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p class="feature-check-text"><strong>Защита хрупких товаров:</strong> хрупкие товары (посуду, термокружки, стекло, электронику) перед сдачей упаковываем в жесткую обрешетку или паллетный борт, чтобы продукция доехала в идеальном состоянии.</p>
        </div>
      </div>
    </section>

    <!-- СЕКЦИЯ 4: СПОСОБЫ ОПЛАТЫ -->
    <section class="delivery-content-block" id="payment" aria-labelledby="payment-title">
      <div class="delivery-block-header">
        <span class="delivery-badge">Официальные расчеты</span>
        <h2 id="payment-title" class="delivery-section-title">4. Способы оплаты</h2>
        <p class="delivery-block-desc">Работаем официально по безналичному расчету. Все платежи прозрачны и подходят для бухгалтерской отчетности.</p>
      </div>

      <div class="payment-methods-grid">
        <div class="payment-card">
          <div class="payment-card-head">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <h3 class="payment-card-title">Оплата по счету для юридических лиц и ИП</h3>
          </div>
          <ol class="payment-steps-list">
            <li>При оформлении заказа прикрепите карточку вашей организации с реквизитами.</li>
            <li>Менеджер проверит наличие позиций на складе и выставит счет на оплату.</li>
            <li>Товар бронируется на складе на 3 рабочих дня.</li>
            <li>После зачисления средств на наш расчетный счет заказ передается на комплектацию либо в печатный цех (если заказано нанесение логотипа).</li>
          </ol>
        </div>

        <div class="payment-card">
          <div class="payment-card-head">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <h3 class="payment-card-title">Оплата по QR-коду (Система быстрых платежей)</h3>
          </div>
          <p class="summary-card-text" style="font-weight: 500;">Удобный вариант для быстрой оплаты без ручного вбивания банковских реквизитов:</p>
          <ul class="payment-steps-list">
            <li>Менеджер формирует индивидуальный QR-код со ссылкой на платеж и отправляет его вам на почту или в мессенджер.</li>
            <li>Вы сканируете код камерой смартфона или через мобильное приложение вашего банка (подходит для счетов юрлиц, бизнес-карт и физлиц).</li>
            <li>Деньги поступают на наш счет в течение нескольких минут, что ускоряет сборку и отправку тиража.</li>
          </ul>
        </div>
      </div>

      ${requisitesPlainText ? `<div class="requisites-copy-card">
        <div class="requisites-copy-head">
          <h3 class="payment-card-title">Реквизиты для оплаты</h3>
          <button type="button" class="requisites-copy-btn" id="requisites-copy-btn" data-text="${escH(requisitesPlainText)}">Скопировать реквизиты</button>
        </div>
        <pre class="requisites-copy-text">${escH(requisitesPlainText)}</pre>
      </div>` : ''}
    </section>

    <!-- СЕКЦИЯ 5: БУХГАЛТЕРСКИЕ ДОКУМЕНТЫ И ГАРАНТИИ -->
    <section class="delivery-content-block" id="documents" aria-labelledby="documents-title">
      <div class="delivery-block-header">
        <span class="delivery-badge">Отчетность</span>
        <h2 id="documents-title" class="delivery-section-title">5. Бухгалтерские документы и гарантии</h2>
        <p class="delivery-block-desc">Вместе с заказом вы получаете полный комплект закрывающих документов:</p>
      </div>

      <div class="summary-cards-grid">
        <div class="summary-card">
          <strong class="summary-card-title">УПД</strong>
          <p class="summary-card-text">Универсальный передаточный документ со всеми необходимыми подписями и кодами маркировки.</p>
        </div>
        <div class="summary-card">
          <strong class="summary-card-title">ЭДО (Диадок / СБИС)</strong>
          <p class="summary-card-text">Отправляем электронные документы в день отгрузки. Это ускоряет учет и исключает потерю бумаг.</p>
        </div>
        <div class="summary-card">
          <strong class="summary-card-title">Бумажные оригиналы</strong>
          <p class="summary-card-text">Вкладываем оригиналы с синими печатями в коробку с грузом либо отправляем заказным письмом Почтой России.</p>
        </div>
      </div>

      <div class="checklist-card">
        <h3 class="checklist-title">Памятка при приемке товара</h3>
        <div class="checklist-grid">
          <div class="checklist-item">
            <strong>1. Сверьте количество мест</strong>
            <p>Проверьте число коробок по накладной до того, как отпустите курьера или водителя.</p>
          </div>
          <div class="checklist-item">
            <strong>2. Осмотрите упаковку</strong>
            <p>Убедитесь, что фирменный скотч и коробки не повреждены, нет следов влаги или сильных вмятин.</p>
          </div>
          <div class="checklist-item">
            <strong>3. Если есть повреждения</strong>
            <p>Сделайте фотографии упаковки с нескольких ракурсов и сразу составьте коммерческий акт с водителем или сотрудником пункта выдачи. Свяжитесь с вашим менеджером — мы оперативно решим вопрос.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- КОНТАКТЫ ОТДЕЛА ЛОГИСТИКИ -->
    <section class="logistics-contact-strip" id="logistics" aria-labelledby="logistics-title">
      <div class="logistics-info">
        <h2 id="logistics-title">Остались вопросы по расчету доставки?</h2>
        <p>Свяжитесь с отделом логистики — менеджер рассчитает оптимальный маршрут, стоимость и сроки отправки вашего тиража.</p>
        <div class="logistics-channels">
          <div><span>Телефон:</span> <a href="tel:+${escH(cleanPhone)}">${escH(phone)}</a></div>
          <div><span>Электронная почта:</span> <a href="mailto:${escH(email)}">${escH(email)}</a></div>
          <div><span>Время работы:</span> <strong style="color: #ffffff">пн–пт с 10:00 до 18:00</strong></div>
        </div>
      </div>
      <div class="logistics-actions">
        <a href="tel:+${escH(cleanPhone)}" class="logistics-btn-primary">Позвонить: ${escH(phone)}</a>
        ${telegramUrl ? `<a href="${escH(telegramUrl)}" target="_blank" rel="noopener" class="logistics-btn-secondary">Написать в Telegram</a>` : ''}
      </div>
    </section>
  </main>

  ${warehouseHtml(company)}
  ${footerHtml(contacts, company)}
  ${cartHtml(company)}

  <script src="/js/delivery.js"></script>
</body>
</html>`;
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  // Бейдж «N фото» в углу карточки — показывается только когда у товара
  // реально загружено больше одного ракурса. На момент внедрения (10.09.2026)
  // такого SKU нет ни одного (все 56 видимых товаров — по одному фото), так
  // что бейдж пока нигде не появится — это не баг, а честное следствие
  // отсутствия данных, а не повод рисовать «1 фото» для всех.
  function photoCountBadgeHtml(product) {
    const count = Array.isArray(product.image_urls) ? product.image_urls.length : 0;
    if (count <= 1) return '';
    return `<span class="catalog-photo-count" aria-label="${count} фото"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7 9.5 4.5h5L16 7"/><circle cx="12" cy="13.5" r="3.2"/></svg>${count}</span>`;
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

  const categoryHeadings = {
    'breloki': 'Брелоки для ключей',
    'meteostancii': 'Метеостанции',
    'chasy-i-budilniki': 'Настольные и дорожные часы',
    'ofisnye-aksessuary': 'Офисные аксессуары',
    'papki': 'Папки для документов',
    'vizitnicy': 'Визитницы и футляры для карт',
    'portfeli': 'Портфели',
    'ruchki-v-futlyarah': 'Ручки в футлярах',
    'aksessuary': 'Подарочные аксессуары',
    'otkryvalki': 'Открывалки для бутылок',
    'nabory-dlya-vina': 'Наборы для вина',
    'nabory-instrumentov': 'Наборы инструментов',
    'usb-haby': 'USB-хабы',
    'dorozhnye-tovary': 'Дорожные товары и аксессуары',
    'termokruzhki': 'Термокружки',
    'sumki': 'Сумки-холодильники',
    'produkty': 'Подарочные продукты',
    'avtoaksessuary': 'Автомобильные аксессуары',
    'zonty': 'Зонты-трости',
    'binokli': 'Театральные бинокли',
  };

  function categoryHeading(category) {
    return categoryHeadings[category.slug] || category.name;
  }

  function categoryMetaDescription(category, items) {
    const s = categoryStats(items);
    const heading = categoryHeading(category);
    const parts = [`${heading} со склада: ${s.count} ${plural(s.count, 'товар', 'товара', 'товаров')}`];
    if (s.min && s.max) parts.push(s.min === s.max ? `цена ${priceText(s.min)} ₽` : `цены от ${priceText(s.min)} до ${priceText(s.max)} ₽`);
    if (s.stock > 0) parts.push(`в наличии ${priceText(s.stock)} шт.`);
    return `${parts.join(', ')}. Оптовые условия — по запросу.`;
  }

  function valueCounts(items, field) {
    const counts = new Map();
    items.forEach(item => {
      const value = String(item[field] || '').trim();
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));
  }

  function categoryGuideHtml(category, items) {
    const heading = categoryHeading(category);
    const materials = valueCounts(items, 'material');
    const colors = valueCounts(items, 'color');
    const s = categoryStats(items);

    // Раздел раньше называл конкретные технологии нанесения (лазерная
    // гравировка, тампопечать до 4 цветов Pantone, УФ-печать) и сроки
    // («1-2 дня», «брендирование от 50 шт. — 3-5 дней») — ничем не
    // подтверждено (см. комментарий у catalogB2bBannerHtml: logo_service_available
    // нигде не подтверждён). Оставлены только факты из карточек товаров.
    return `<section class="category-guide" aria-labelledby="category-guide-heading">
      <span class="guide-badge">Гид покупателя</span>
      <h2 id="category-guide-heading" class="guide-title">Как выбрать ${escH(heading.toLocaleLowerCase('ru-RU'))}</h2>
      <p class="guide-intro">В категории «${escH(heading)}» со склада в наличии ${s.count} ${plural(s.count, 'модель', 'модели', 'моделей')} (всего ${priceText(s.stock)} шт.). Цены от ${priceText(s.min)} до ${priceText(s.max)} ₽. Сравните товары по данным в карточках: материалу, цвету, цене, артикулу и текущему остатку. Если нужной характеристики нет на странице, уточните её у менеджера до заказа.</p>
      ${(materials.length || colors.length) ? `<div class="guide-specs-grid">
        <div class="guide-spec-box">
          <strong>Материалы и цвета</strong>
          <p>${materials.length ? `Материалы: ${materials.map(([m, count]) => `${escH(m.toLowerCase())} (${count})`).join(', ')}.` : ''} ${colors.length ? `Цвета: ${colors.map(([c, count]) => `${escH(c.toLowerCase())} (${count})`).join(', ')}.` : ''}</p>
        </div>
      </div>` : ''}
    </section>`;
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

  // Hero-контактная сетка (Концепт 1 «Инвентарный журнал», раздел 11 ТЗ
  // редизайна): реальные товарные фото вместо декоративной картинки. Берётся
  // тот же список и порядок, что и products-grid ниже, — первые карточки
  // каталога, без отдельной курации, чтобы не рассинхронизироваться при
  // изменении ассортимента.
  function heroContactSheetHtml(products) {
    return products.map(product => {
      const url = `/product/${encodeURIComponent(productSlug(product))}`;
      const image = product.image || (product.image_urls && product.image_urls[0]) || '';
      const name = product.name || productName(product);
      return `<a class="hero-sheet-tile" href="${url}">
        <span class="hero-sheet-photo">${image ? `<img src="${escH(image)}" alt="${escH(name)}" loading="lazy">` : ''}</span>
        <span class="hero-sheet-caption"><span class="hero-sheet-article">Арт. ${escH(product.article)}</span><span class="hero-sheet-price">${priceText(retailPrice(product))} ₽</span></span>
      </a>`;
    }).join('');
  }

  // Карточка SSR-грида главной. Разметка намеренно повторяет ту, что строит
  // renderProducts() в public/js/shop.js: грид перерисовывается на клиенте, и
  // при расхождении разметки пользователь увидел бы скачок при гидратации.
  // На главной сначала показывается только HOME_PAGE_SIZE карточек, остальные
  // открываются по клику «Показать ещё». Карточки сверх лимита остаются в
  // HTML — атрибут hidden убирает только отображение, ссылки на них
  // по-прежнему присутствуют в исходном коде страницы и доступны обходчику
  // (verify-seo.js считает count(href="/product/") по исходному HTML, а не
  // по видимости, так что регресс это не сломает). Совпадение с клиентским
  // PAGE_SIZE в shop.js обязательно: иначе после гидратации высота страницы
  // подпрыгнет (то самое «мигание при гидратации», о котором предупреждает
  // комментарий выше про listed — full-таблица здесь работает по тому же
  // принципу, просто для новой функции пагинации, а не для порядка/среза.
  const HOME_PAGE_SIZE = 20;

  function homeProductCardHtml(product, hiddenBeyondPage) {
    const stock = quantity(product);
    const url = `/product/${encodeURIComponent(productSlug(product))}`;
    const image = product.image || (product.image_urls && product.image_urls[0]) || '';
    const name = product.name || productName(product);
    const price = retailPrice(product);
    return `
      <article class="product-card" itemscope itemtype="https://schema.org/Product"${hiddenBeyondPage ? ' hidden' : ''}>
        <a href="${url}" class="card-img-link" aria-label="${escH(name)}">
          <div class="card-img-wrap">
            <img src="${escH(image)}" alt="${escH(name)}" itemprop="image" loading="lazy"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eee%22/></svg>'">
          </div>
          <span class="visually-hidden">${escH(name)}</span>
        </a>
        <div class="card-body">
          <span class="card-article">Арт. ${escH(product.article)}</span>
          <a href="${url}" class="card-name" itemprop="name">${escH(name)}</a>
          <div class="card-prices">
            <data class="card-price" itemprop="price" value="${price}">${priceText(price)} ₽</data>
            <span class="card-opt-note">Опт — по запросу</span>
          </div>
          <span class="card-qty ${stock > 0 ? 'in-stock' : 'out-stock'}">${stock > 0 ? `В наличии: ${stock} шт.` : 'Нет в наличии'}</span>
          ${stock > 0 ? `<button class="add-to-cart-btn" data-article="${escH(product.article)}">В корзину</button>` : ''}
        </div>
      </article>`;
  }

  // Плитки категорий с реальным товарным фото (раздел 6 ТЗ редизайна:
  // «Плитки с реальными товарами, а не абстрактными иллюстрациями») —
  // картинка берётся у первого товара категории с фото, без отдельного
  // подбора, чтобы не рассинхронизироваться при изменении ассортимента.
  function categoryDirectoryHtml(categories, byCategory) {
    const items = categories.map(category => {
      const items = byCategory.get(category.slug) || [];
      const count = items.length;
      const withImage = items.find(item => item.image || (item.image_urls && item.image_urls[0]));
      const image = withImage ? (withImage.image || withImage.image_urls[0]) : '';
      const heading = categoryHeading(category);
      return `<li class="category-tile">
      <a href="/category/${encodeURIComponent(category.slug)}">
        <span class="category-tile-photo">${image ? `<img src="${escH(image)}" alt="" loading="lazy">` : ''}</span>
        <span class="category-tile-name">${escH(heading)}</span>
        <span class="category-tile-count">${count}</span>
      </a>
    </li>`;
    }).join('');
    return `<section class="category-directory" aria-labelledby="categories-heading">
    <h2 id="categories-heading">Категории каталога</h2>
    <ul class="category-directory-list">${items}</ul>
    <p><a href="/catalog" class="category-directory-all">Весь каталог — все категории и товары</a></p>
  </section>`;
  }

  function homeOverviewHtml(products, categories) {
    const visible = products.filter(product => product.visible);
    const available = visible.filter(product => quantity(product) > 0);
    const stock = available.reduce((sum, product) => sum + quantity(product), 0);
    const prices = available.map(retailPrice).filter(value => value > 0);
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;
    return `<section class="catalog-overview" aria-labelledby="catalog-overview-heading">
  <h2 id="catalog-overview-heading">Сувениры оптом: ассортимент, цены и наличие</h2>
  <p>В каталоге СкладПромо — сувенирная продукция и бизнес-подарки с указанными ценами и остатками. Опубликовано ${visible.length} ${plural(visible.length, 'товар', 'товара', 'товаров')} в ${categories.length} ${plural(categories.length, 'категории', 'категориях', 'категориях')}.</p>
  <p>${available.length ? `В наличии ${available.length} ${plural(available.length, 'позиция', 'позиции', 'позиций')} — всего ${priceText(stock)} шт.${min && max ? ` Цены в каталоге: от ${priceText(min)} до ${priceText(max)} ₽.` : ''}` : 'Позиций с подтверждённым остатком сейчас нет.'} На страницах товаров указаны артикулы, цены и остатки; оптовые условия подтверждаются менеджером по запросу.</p>
</section>`;
  }

  function homePageHtml(products, contacts = {}, company = {}) {
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
    const orgLd = organizationLd(contacts, company);

    const head = `<title>${escH(title)}</title><meta name="description" content="${escH(description)}"><link rel="canonical" href="${cleanSiteUrl}/"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${cleanSiteUrl}/"><meta property="og:site_name" content="СкладПромо"><script type="application/ld+json">${jsonForScript(websiteLd)}</script><script type="application/ld+json">${jsonForScript(categoryListLd)}</script><script type="application/ld+json">${jsonForScript(orgLd)}</script>${analyticsHtml()}`;

    // Hero берётся из contacts.json с тем же fallback, что и в shop.js:367 —
    // иначе SSR-текст и текст после гидратации расходятся, как только
    // администратор отредактирует баннер.
    const heroTitle = contacts.hero_title || 'Сувенирная продукция и бизнес-подарки со склада';
    const heroText = contacts.hero_text || 'Товары со склада с актуальными ценами и остатками.';

    return index.replace(/<title>[\s\S]*?<\/title>/i, head)
      .replace(/<h1 id="hero-title">[\s\S]*?<\/h1>/i, `<h1 id="hero-title">${escH(heroTitle)}</h1>`)
      .replace(/<p id="hero-text">[\s\S]*?<\/p>/i, `<p id="hero-text">${escH(heroText)}</p>`)
      .replace('<div class="hero-contact-sheet" id="hero-contact-sheet"></div>',
        `<div class="hero-contact-sheet" id="hero-contact-sheet">${heroContactSheetHtml(listed.slice(0, 8))}</div>`)
      .replace('<!-- ====== CATALOG ====== -->', `${homeOverviewHtml(products, categories)}\n\n<!-- ====== CATALOG ====== -->`)
      .replace('<div class="catalog-layout">', `${categoryDirectoryHtml(categories, byCategory)}\n  <div class="catalog-layout">`)
      .replace('<div class="products-grid" id="products-grid"></div>',
        `<div class="products-grid" id="products-grid">${listed.map((p, i) => homeProductCardHtml(p, i >= HOME_PAGE_SIZE)).join('')}</div>${listed.length > HOME_PAGE_SIZE ? '<noscript><style>#products-grid .product-card[hidden]{display:flex!important}</style></noscript>' : ''}`)
      .replace('<footer class="site-footer">', `${warehouseHtml(company)}\n<footer class="site-footer">${requisitesHtml(company)}`);
  }

  function catalogProductCardHtml(product) {
    const stock = quantity(product);
    const price = retailPrice(product);
    const image = product.image || (product.image_urls && product.image_urls[0]);
    const isSale = isValidSale(product);
    const imgSrc = image ? `/${escH(String(image).replace(/^\//, ''))}` : '';
    const pName = productName(product);
    const pSlug = productSlug(product);
    const pUrl = `/product/${encodeURIComponent(pSlug)}`;
    const categoryName = product.category_name || product.category || 'Каталог';

    return `<article class="catalog-card" data-article="${escH(product.article)}" data-name="${escH(pName.toLowerCase())}" data-cat="${escH((product.category_slug || '').toLowerCase())}">
      <div class="catalog-card-media">
        <a href="${pUrl}" class="catalog-card-img-link" aria-label="${escH(pName)}">
          ${imgSrc ? `<img src="${imgSrc}" alt="${escH(pName)}" loading="lazy" class="catalog-card-img">` : `<div class="catalog-card-no-img">Нет фото</div>`}
          <span class="visually-hidden">${escH(pName)}</span>
        </a>
        <div class="catalog-card-badges">
          ${isSale ? `<span class="catalog-badge-sale">−${escH(product.discount_percent)}%</span>` : ''}
          <span class="catalog-badge-art">Арт. ${escH(product.article)}</span>
        </div>
        ${photoCountBadgeHtml(product)}
      </div>
      <div class="catalog-card-content">
        <div class="catalog-card-cat-label">${escH(categoryName)}</div>
        <h3 class="catalog-card-title"><a href="${pUrl}">${escH(pName)}</a></h3>
        <div class="catalog-card-pricing">
          ${isSale ? `<span class="catalog-card-old-price">${priceText(product.old_price)} ₽</span>` : ''}
          <span class="catalog-card-price">${priceText(price)} ₽</span>
          <span class="catalog-card-opt-hint">Опт по запросу</span>
        </div>
        <div class="catalog-card-stock ${stock > 0 ? 'in-stock' : 'out-stock'}">
          <span class="stock-dot"></span>
          <span>${stock > 0 ? `В наличии: ${stock} шт.` : 'Под заказ'}</span>
        </div>
        <div class="catalog-card-actions">
          ${stock > 0 ? `<button type="button" class="catalog-add-cart-btn" data-article="${escH(product.article)}" data-name="${escH(pName)}" data-price="${price}" data-qty="${stock}" data-image="${imgSrc}">В корзину</button>` : `<a href="${pUrl}" class="catalog-order-btn">Подробнее</a>`}
          <a href="${pUrl}" class="catalog-detail-link" aria-label="Подробнее о ${escH(pName)}">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>
      </div>
    </article>`;
  }

  function catalogCategoryTilesHtml(categories, byCategory) {
    const tiles = categories.map(cat => {
      const items = byCategory.get(cat.slug) || [];
      const withImg = items.find(i => i.image || (i.image_urls && i.image_urls[0]));
      const img = withImg ? (withImg.image || withImg.image_urls[0]) : '';
      const prices = items.map(retailPrice).filter(p => p > 0);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      return `<a href="#cat-${encodeURIComponent(cat.slug)}" class="catalog-tile-card" data-cat-slug="${escH(cat.slug)}">
        <div class="catalog-tile-thumb">${img ? `<img src="/${escH(String(img).replace(/^\//, ''))}" alt="${escH(cat.name)}" loading="lazy">` : '<span class="tile-empty"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m21 16-9 5-9-5V8l9-5 9 5v8Z"/><path d="m3.3 8 8.7 4.8 8.7-4.8M12 12.8V21"/></svg></span>'}</div>
        <div class="catalog-tile-info">
          <span class="catalog-tile-name">${escH(cat.name)}</span>
          <div class="catalog-tile-meta">
            <span class="catalog-tile-count">${items.length} ${plural(items.length, 'товар', 'товара', 'товаров')}</span>
            ${minPrice ? `<span class="catalog-tile-price">от ${priceText(minPrice)} ₽</span>` : ''}
          </div>
        </div>
      </a>`;
    }).join('');

    return `<section class="catalog-matrix-section" aria-labelledby="catalog-matrix-heading">
      <div class="catalog-matrix-head">
        <h2 id="catalog-matrix-heading" class="catalog-matrix-title">Все категории каталога</h2>
        <span class="catalog-matrix-subtitle">${categories.length} ${plural(categories.length, 'направление', 'направления', 'направлений')}</span>
      </div>
      <div class="catalog-tiles-grid">${tiles}</div>
    </section>`;
  }

  function catalogPillsBarHtml(categories, byCategory, totalProducts) {
    return `<nav class="catalog-sticky-bar" id="catalog-sticky-bar" aria-label="Быстрый переход по категориям">
      <div class="catalog-sticky-inner">
        <button type="button" class="catalog-pill active" data-target="all">Все товары <span class="pill-badge">${totalProducts}</span></button>
        ${categories.map(cat => {
          const count = (byCategory.get(cat.slug) || []).length;
          return `<a href="#cat-${encodeURIComponent(cat.slug)}" class="catalog-pill" data-target="${escH(cat.slug)}">${escH(cat.name)} <span class="pill-badge">${count}</span></a>`;
        }).join('')}
      </div>
    </nav>`;
  }

  // Исходная версия баннера утверждала вещи, которых на сайте нет: тиражи
  // «от 20 до 50 000 шт.», приёмку с контролем качества, услугу нанесения
  // логотипа (logo_service_available=false у всех 69 SKU, партнёр по нанесению
  // нигде не подтверждён — то же решение, что и в SEO-бэклоге про GIST-01),
  // конкретные ТК и работу с НДС/ЭДО (налоговый режим неизвестен, пока
  // company.json пуст). Оставлены только подтверждённые факты: склад в СПб,
  // доставка по РФ, формулировка «Опт — по запросу», уже используемая на
  // каждой карточке товара. Блок про работу с юрлицами условен и появляется,
  // только когда заполнено название организации — та же логика, что и в
  // requisitesHtml/warehouseHtml.
  function catalogB2bBannerHtml(contacts = {}, company = {}) {
    const phone = validPhone(contacts.phone);
    const telegramUrl = validUrl(contacts.telegram, ['t.me/username']);
    const legalFeature = company.legal_name
      ? `<div class="b2b-feat"><span class="feat-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg></span><strong>Работаем с юрлицами</strong><p>Реквизиты и способ расчёта менеджер подтвердит по запросу</p></div>`
      : '';
    return `<section class="catalog-b2b-banner" aria-labelledby="b2b-banner-title">
      <div class="b2b-banner-content">
        <span class="b2b-pill">Для корпоративных клиентов и агентств</span>
        <h2 id="b2b-banner-title">Оптовые и розничные поставки со склада в Санкт-Петербурге</h2>
        <p>Собственный склад сувенирной продукции и бизнес-подарков — актуальные остатки и цены на сайте, доставка по России, самовывоз в Санкт-Петербурге.</p>
        <div class="b2b-features-grid">
          <div class="b2b-feat"><span class="feat-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg></span><strong>Актуальные остатки</strong><p>Наличие и цена на сайте — те же, что на складе прямо сейчас</p></div>
          <div class="b2b-feat"><span class="feat-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span><strong>Опт по запросу</strong><p>Менеджер подтвердит цену и условия для нужного объёма</p></div>
          ${legalFeature}
          <div class="b2b-feat"><span class="feat-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></span><strong>Доставка по РФ</strong><p>Отправка транспортной компанией или самовывоз со склада</p></div>
        </div>
        <div class="b2b-cta-row">
          ${phone ? `<a href="tel:+${escH(phone.replace(/\D/g, ''))}" class="b2b-btn-primary">Позвонить: ${escH(phone)}</a>` : ''}
          ${telegramUrl ? `<a href="${escH(telegramUrl)}" target="_blank" rel="noopener" class="b2b-btn-secondary">Написать в Telegram</a>` : ''}
        </div>
      </div>
    </section>`;
  }

  function catalogPageHtml(products, contacts, company = {}) {
    const categories = sortedCategories(products);
    const byCategory = groupByCategory(products);
    const title = 'Каталог сувенирной продукции и бизнес-подарков со склада | СкладПромо';
    const total = products.filter(product => product.visible).length;
    const inStockCount = products.filter(product => product.visible && quantity(product) > 0).length;
    const description = `Полный каталог сувенирной продукции со склада в Санкт-Петербурге: ${categories.length} ${plural(categories.length, 'категория', 'категории', 'категорий')}, ${total} ${plural(total, 'товар', 'товара', 'товаров')} с актуальными ценами и остатками. Опт и розница.`;
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
    const collectionLd = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Каталог сувенирной продукции и бизнес-подарков',
      url,
      description,
      isPartOf: { '@type': 'WebSite', name: 'СкладПромо', url: `${cleanSiteUrl}/` },
      mainEntity: {
        '@type': 'ItemList',
        name: 'Категории каталога',
        numberOfItems: categories.length,
        itemListElement: listLd.itemListElement,
      },
    };

    const sections = categories.map(category => {
      const items = byCategory.get(category.slug) || [];
      if (!items.length) return '';
      const catHeading = categoryHeading(category);
      return `<section class="catalog-category-section" id="cat-${encodeURIComponent(category.slug)}" data-slug="${escH(category.slug)}" aria-labelledby="heading-cat-${encodeURIComponent(category.slug)}">
        <div class="category-section-header">
          <div class="category-header-main">
            <div class="category-title-wrap">
              <h2 class="category-section-title" id="heading-cat-${encodeURIComponent(category.slug)}">
                <a href="/category/${encodeURIComponent(category.slug)}">${escH(catHeading)}</a>
              </h2>
              <span class="category-section-badge">${items.length} ${plural(items.length, 'товар', 'товара', 'товаров')}</span>
            </div>
            <p class="category-section-desc">${escH(categoryIntro(category, items))}</p>
          </div>
          <a href="/category/${encodeURIComponent(category.slug)}" class="category-more-link">Все товары в категории →</a>
        </div>
        <div class="catalog-products-grid">
          ${items.map(item => catalogProductCardHtml(item)).join('')}
        </div>
      </section>`;
    }).join('');

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
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escH(url)}">
  <meta property="og:site_name" content="СкладПромо">
  <script type="application/ld+json">${jsonForScript(breadcrumbLd)}</script>
  <script type="application/ld+json">${jsonForScript(listLd)}</script>
  <script type="application/ld+json">${jsonForScript(collectionLd)}</script>
  ${faviconHtml()}
  ${revealNoscriptHtml()}
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/product.css">
  <link rel="stylesheet" href="/css/catalog.css">
  ${analyticsHtml()}
</head>
<body class="catalog-page-body">
  ${headerHtml(contacts)}
  <main class="catalog-page-wrapper">
    <nav class="catalog-breadcrumb" aria-label="Навигация">
      <a href="/">Главная</a>
      <span class="catalog-breadcrumb-sep">›</span>
      <span class="catalog-breadcrumb-current">Каталог товаров</span>
    </nav>

    <header class="catalog-hero">
      <div class="catalog-hero-top">
        <h1 class="catalog-hero-title">Каталог сувенирной продукции и подарков</h1>
        <p class="catalog-hero-desc">${escH(description)}</p>
      </div>

      <div class="catalog-hero-metrics">
        <span class="metric-pill"><span class="metric-pill-dot"></span>${categories.length} ${plural(categories.length, 'категория', 'категории', 'категорий')}</span>
        <span class="metric-pill"><span class="metric-pill-dot success"></span>${inStockCount} ${plural(inStockCount, 'позиция', 'позиции', 'позиций')} в наличии</span>
        <span class="metric-pill"><span class="metric-pill-dot"></span>Опт и розница</span>
        <span class="metric-pill"><span class="metric-pill-dot"></span>Склад в Санкт-Петербурге</span>
      </div>

      <div class="catalog-search-wrap">
        <div class="catalog-search-input-box">
          <svg class="catalog-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="search" id="catalog-hero-search" class="catalog-search-input" placeholder="Поиск по названию, артикулу или категории…" autocomplete="off">
          <button type="button" id="catalog-search-clear" class="catalog-search-clear" aria-label="Очистить поиск">✕</button>
        </div>
        <div class="catalog-search-status" id="catalog-search-status" aria-live="polite"></div>
      </div>
    </header>

    ${catalogCategoryTilesHtml(categories, byCategory)}

    ${catalogPillsBarHtml(categories, byCategory, total)}

    <div class="catalog-sections-wrap">
      ${sections}
    </div>

    ${catalogB2bBannerHtml(contacts, company)}
  </main>

  ${warehouseHtml(company)}
  ${footerHtml(contacts, company)}
  ${cartHtml(company)}

  <script src="/js/catalog.js"></script>
</body>
</html>`;
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
  const companyFile  = () => path.join(path.dirname(productsFile), 'company.json');

  router.get('/', (req, res) => {
    res.send(homePageHtml(readJSON(productsFile, []), readJSON(contactsFile(), {}), readJSON(companyFile(), {})));
  });

  router.get('/catalog', (req, res) => {
    res.send(catalogPageHtml(readJSON(productsFile, []), readJSON(contactsFile(), {}), readJSON(companyFile(), {})));
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
    res.send(productPageHtml(product, products.filter(item => item.visible), readJSON(contactsFile(), {}), readJSON(companyFile(), {})));
  });

  router.get('/category/:slug', (req, res) => {
    const products = readJSON(productsFile, []).filter(product => product.visible);
    const category = categoriesFrom(products).get(req.params.slug);
    if (!category) return res.status(404).type('html').send('<!doctype html><title>Категория не найдена</title><h1>Категория не найдена</h1>');
    res.send(categoryPageHtml(category, products.filter(product => (product.category_slug || 'catalog') === category.slug), readJSON(contactsFile(), {}), products, readJSON(companyFile(), {})));
  });

  router.get('/sale', (req, res) => {
    const saleProducts = readJSON(productsFile, []).filter(product => product.visible && isValidSale(product));
    if (!saleProducts.length) return res.status(404).type('html').send('<!doctype html><title>Распродажа не проводится</title><h1>Распродажа не проводится</h1>');
    res.send(salePageHtml(saleProducts, readJSON(contactsFile(), {}), readJSON(companyFile(), {})));
  });

  router.get('/delivery', (req, res) => {
    res.send(deliveryPageHtml(readJSON(contactsFile(), {}), readJSON(companyFile(), {})));
  });

  router.get('/delivery-and-payment', (req, res) => {
    res.redirect(301, '/delivery');
  });

  // Политика без названия оператора юридически бессмысленна: подписать её
  // некому. Пока в «Компании» не заполнено юрлицо — отдаём 404, а не
  // документ с пустым местом вместо оператора.
  router.get('/privacy', (req, res) => {
    const company = readJSON(companyFile(), {});
    if (!company.legal_name) {
      return res.status(404).type('html').send('<!doctype html><title>Страница не найдена</title><h1>Страница не найдена</h1>');
    }
    res.send(privacyPageHtml(readJSON(contactsFile(), {}), company));
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
      { loc: `${cleanSiteUrl}/delivery`, priority: '0.8', modified: pageChanged(latestChange(products)) },
      // /privacy попадает в карту только когда роут реально отдаёт документ
      // (условие то же, что в самом роуте — заполнено юрлицо), иначе в
      // sitemap ушёл бы URL, отвечающий 404.
      ...(readJSON(companyFile(), {}).legal_name ? [{ loc: `${cleanSiteUrl}/privacy`, priority: '0.3', modified: PRIVACY_LASTMOD }] : []),
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
      return `    <item><g:id>${escH(product.article)}</g:id><g:title>${escH(productName(product))}</g:title><g:description>${escH(feedDescription(product))}</g:description><g:link>${escH(feedProductUrl(product))}</g:link>${image ? `<g:image_link>${escH(feedAssetUrl(image))}</g:image_link>` : ''}<g:availability>${inStock(product) ? 'in_stock' : 'out_of_stock'}</g:availability><g:price>${retailPrice(product)}.00 RUB</g:price><g:condition>new</g:condition><g:brand>${escH(brandName(product))}</g:brand><g:identifier_exists>no</g:identifier_exists></item>`;
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
    const offers = products.map(product => { const image = feedImage(product); return `<offer id="${escH(product.article)}" available="${inStock(product)}"><url>${escH(feedProductUrl(product))}</url><price>${retailPrice(product)}</price><currencyId>RUB</currencyId><categoryId>${ids[product.category_slug] || 1}</categoryId>${image ? `<picture>${escH(feedAssetUrl(image))}</picture>` : ''}<vendor>${escH(brandName(product))}</vendor><name>${escH(productName(product))}</name><description>${escH(feedDescription(product))}</description></offer>`; }).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><yml_catalog date="${new Date().toISOString().slice(0, 16).replace('T', ' ')}"><shop><name>СкладПромо</name><company>СкладПромо</company><url>${base}/</url><currencies><currency id="RUB" rate="1"/></currencies><categories>${categoriesXml}</categories><offers>${offers}</offers></shop></yml_catalog>`);
  });

  return router;
}

module.exports = { createSeoRouter };
