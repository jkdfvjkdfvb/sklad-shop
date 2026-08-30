'use strict';

/*
 * Регресс-проверка SEO и — главное — паритета цены/остатка между всеми
 * публичными поверхностями: HTML, Product JSON-LD, llms.txt и /api/products.
 * Рассинхрон уже случался: у 69/69 товаров сохранённое meta_description
 * содержало цену ровно ×3 от фактической.
 *
 * Запуск (сервер должен быть поднят):
 *   SEO_TEST_BASE=http://127.0.0.1:3000 node scripts/verify-seo.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const products = JSON.parse(fs.readFileSync(path.join(root, 'server/data/products.json'), 'utf8'));
const meta = fs.readFileSync(path.join(root, 'docs/product-meta-tags.csv'), 'utf8').trim().split(/\r?\n/)
  .slice(1).map(line => { const [url, article, h1, title, meta_description, target_cluster] = line.split(';'); return { url, article, h1, title, meta_description, target_cluster }; });
const metaByArticle = new Map(meta.map(row => [row.article, row]));
const base = process.env.SEO_TEST_BASE || 'http://127.0.0.1:3101';
const canonicalBase = (process.env.SEO_CANONICAL_BASE || 'https://salegifts.ru').replace(/\/$/, '');
const errors = [];

function expect(condition, message) { if (!condition) errors.push(message); }
function extract(html, pattern) { return (html.match(pattern) || [])[1] || ''; }
function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => { try { return JSON.parse(match[1]); } catch { return null; } })
    .filter(Boolean);
}
function ldOfType(html, type) { return ldBlocks(html).find(value => value['@type'] === type); }
const money = value => Number(value).toLocaleString('ru-RU').replace(/ /g, ' ');

(async () => {
  expect(products.length === 69, `Expected 69 products, received ${products.length}`);
  expect(meta.length === 69, `Expected 69 CSV rows, received ${meta.length}`);

  const titles = new Set();
  const descriptions = new Set();

  // Публичный API — одна из четырёх сверяемых поверхностей, плюс проверка,
  // что наружу не уехали внутренние поля.
  const apiProducts = await (await fetch(`${base}/api/products`)).json();
  const apiByArticle = new Map(apiProducts.map(item => [String(item.article), item]));
  const apiFields = Object.keys(apiProducts[0] || {});
  for (const leaked of ['meta_description', 'meta_description_template', 'target_cluster', 'wholesale_price_from', 'seo_updated_at']) {
    expect(!apiFields.includes(leaked), `/api/products leaks internal field "${leaked}"`);
  }
  const contacts = await (await fetch(`${base}/api/contacts`)).json();
  for (const leaked of ['order_email', 'telegram_chat_id', 'smtp_pass', 'smtp_user', 'telegram_bot_token']) {
    expect(!(leaked in contacts), `/api/contacts leaks "${leaked}"`);
  }

  const llms = await (await fetch(`${base}/llms.txt`)).text();
  const llmsLines = llms.split('\n');

  // Фиды — ещё две публичные поверхности с ценой и брендом. XML не парсим
  // отдельным пакетом ради одного поля на артикул — регулярка по <item>/<offer>
  // достаточна и не тянет новую зависимость.
  const googleFeed = await (await fetch(`${base}/feeds/google.xml`)).text();
  const yandexFeed = await (await fetch(`${base}/feeds/yandex.yml`)).text();
  const googleBrandByArticle = new Map(
    [...googleFeed.matchAll(/<g:id>([^<]*)<\/g:id>[\s\S]*?<g:brand>([^<]*)<\/g:brand>/g)]
      .map(([, article, brand]) => [article, brand]),
  );
  const yandexBrandByArticle = new Map(
    [...yandexFeed.matchAll(/<offer id="([^"]*)"[\s\S]*?<vendor>([^<]*)<\/vendor>/g)]
      .map(([, article, brand]) => [article, brand]),
  );

  for (const product of products) {
    const csv = metaByArticle.get(String(product.article));
    expect(Boolean(csv), `${product.article}: missing CSV metadata`);
    if (!csv) continue;

    const response = await fetch(`${base}/product/${encodeURIComponent(product.slug)}`);
    const html = await response.text();
    const title = extract(html, /<title>([\s\S]*?)<\/title>/);
    const description = extract(html, /<meta name="description" content="([\s\S]*?)">/);
    const h1 = extract(html, /<h1[^>]*>([\s\S]*?)<\/h1>/);
    const canonical = extract(html, /<link rel="canonical" href="([^"]+)">/);
    const ogUrl = extract(html, /<meta property="og:url" content="([^"]+)">/);
    const ld = ldOfType(html, 'Product');
    const stock = Number(product.stock_qty);
    const price = Number(product.price);

    expect(response.status === 200, `${product.article}: expected 200, received ${response.status}`);
    expect(title === csv.title, `${product.article}: title differs from CSV`);
    expect(h1 === csv.h1, `${product.article}: H1 differs from CSV`);
    expect(canonical === `${canonicalBase}/product/${product.slug}`, `${product.article}: canonical is not the canonical HTTPS URL`);
    expect(ogUrl === canonical, `${product.article}: og:url differs from canonical`);

    // --- Паритет цены на четырёх поверхностях ---
    expect(html.includes(`${money(price)} ₽`), `${product.article}: visible HTML price is missing or stale`);
    expect(ld && Number(ld.offers.price) === price, `${product.article}: Product JSON-LD price differs from catalog price`);
    if (stock > 0) {
      const api = apiByArticle.get(String(product.article));
      expect(api && Number(api.price) === price, `${product.article}: /api/products price differs from catalog price`);
      const llmsLine = llmsLines.find(line => line.includes(`арт. ${product.article}.`));
      expect(Boolean(llmsLine), `${product.article}: missing from llms.txt`);
      expect(!llmsLine || llmsLine.includes(`${money(price)} ₽`), `${product.article}: llms.txt price differs from catalog price`);
      expect(!llmsLine || llmsLine.includes(`в наличии ${stock} шт.`), `${product.article}: llms.txt stock differs from catalog stock`);
    }

    // --- Паритет остатка и описания ---
    expect(html.includes(`В наличии: ${stock} шт.`), `${product.article}: visible stock is missing or stale`);
    expect(html.includes(description), `${product.article}: description is not visible in HTML`);
    // Описание собирается из шаблона живыми значениями, а не берётся из
    // замороженного снимка — поэтому сверяем с подстановкой, а не с CSV.
    if (product.meta_description_template && stock > 0) {
      const expected = product.meta_description_template
        .replaceAll('{{stock_qty}}', String(stock))
        .replaceAll('{{retail_price}}', money(price));
      expect(description === expected, `${product.article}: description is not rendered from the live template`);
    }
    expect(!/\d[\d\s]*\s*₽/.test(description) || description.includes(`${money(price)} ₽`),
      `${product.article}: description contains a price that differs from the catalog price`);

    expect(!/СПб|в Санкт-Петербурге/i.test(title) && !/СПб|в Санкт-Петербурге/i.test(description), `${product.article}: artificial regional metadata remains`);
    expect(!/[.…]{1,3}/.test(title), `${product.article}: title is truncated`);
    expect(!/<link rel="canonical" href="http:\/\//.test(html), `${product.article}: HTTP canonical`);
    expect(ld && ld.name === csv.h1, `${product.article}: Product JSON-LD name differs from H1`);
    expect(ld && ld.offers.availability === 'https://schema.org/InStock', `${product.article}: Product JSON-LD availability differs`);
    expect(ld && ld.offers.url === canonical, `${product.article}: Product JSON-LD URL differs`);
    // brand — обязательное поле в Product-микроразметке Яндекса. Ни у одного
    // товара нет реального manufacturer_or_brand, поэтому все 69 обязаны
    // получить один и тот же дефолт — и получить его одинаково на всех трёх
    // поверхностях, иначе фиды и структурные данные разъедутся так же, как
    // однажды разъехалась цена.
    const expectedBrand = product.manufacturer_or_brand || 'salegifts.ru';
    expect(ld && ld.brand && ld.brand.name === expectedBrand,
      `${product.article}: Product JSON-LD brand is missing or wrong (expected "${expectedBrand}")`);
    expect(googleBrandByArticle.get(String(product.article)) === expectedBrand,
      `${product.article}: Google feed brand is missing or wrong`);
    expect(yandexBrandByArticle.get(String(product.article)) === expectedBrand,
      `${product.article}: Yandex feed vendor is missing or wrong`);
    // Позиции хлебных крошек должны вести на разные URL.
    const crumbs = ldOfType(html, 'BreadcrumbList');
    const crumbUrls = crumbs ? crumbs.itemListElement.map(entry => entry.item) : [];
    expect(new Set(crumbUrls).size === crumbUrls.length, `${product.article}: BreadcrumbList has duplicate URLs`);

    titles.add(title); descriptions.add(description);
  }

  expect(titles.size === 69, `Titles are not unique (${titles.size}/69)`);
  expect(descriptions.size === 69, `Descriptions are not unique (${descriptions.size}/69)`);

  // --- Категории: schema и уникальность интро ---
  const categorySlugs = ['breloki', 'chasy-i-budilniki', 'vizitnicy', 'papki', 'portfeli', 'otkryvalki', 'nabory-dlya-vina', 'usb-haby', 'dorozhnye-tovary', 'ofisnye-aksessuary'];
  const categoryIntros = new Set();
  for (const slug of categorySlugs) {
    const response = await fetch(`${base}/category/${slug}`);
    const html = await response.text();
    expect(response.status === 200, `Category ${slug}: expected 200, received ${response.status}`);
    expect(Boolean(ldOfType(html, 'BreadcrumbList')), `Category ${slug}: BreadcrumbList JSON-LD is missing`);
    expect(Boolean(ldOfType(html, 'ItemList')), `Category ${slug}: ItemList JSON-LD is missing`);
    categoryIntros.add(extract(html, /<p class="category-intro">([\s\S]*?)<\/p>/));
  }
  expect(categoryIntros.size === categorySlugs.length, `Category intros are not unique (${categoryIntros.size}/${categorySlugs.length})`);

  // --- Главная: каталог должен быть в исходном HTML, без JavaScript ---
  const home = await (await fetch(`${base}/`)).text();
  expect(home.includes('Сувенирная продукция и бизнес-подарки со склада'), 'Home H1 is missing');
  expect((home.match(/href="\/category\//g) || []).length >= 20, 'Home does not server-render category links');
  expect((home.match(/href="\/product\//g) || []).length >= 20, 'Home does not server-render product links');
  expect(Boolean(ldOfType(home, 'WebSite')), 'Home WebSite JSON-LD is missing');
  expect(!home.includes('+7 (000)') && !home.includes('t.me/username') && !home.includes('vk.com/username'), 'Test contacts are exposed on home');

  const catalog = await fetch(`${base}/catalog`);
  expect(catalog.status === 200, `/catalog: expected 200, received ${catalog.status}`);

  // --- Канонизация URL ---
  for (const [url, expected] of [['/index.html', '/'], ['/category/breloki/', '/category/breloki']]) {
    const response = await fetch(`${base}${url}`, { redirect: 'manual' });
    expect(response.status === 301, `${url}: expected 301, received ${response.status}`);
    expect((response.headers.get('location') || '').endsWith(expected), `${url}: must redirect to ${expected}`);
  }

  const robots = await (await fetch(`${base}/robots.txt`)).text();
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  expect(robots.includes(`${canonicalBase}/sitemap.xml`), 'robots.txt does not use the canonical sitemap URL');
  expect(sitemap.includes(`${canonicalBase}/product/`), 'sitemap has no canonical product URLs');
  expect(!/<loc>http:\/\//.test(sitemap), 'sitemap contains HTTP page URLs');
  expect(!/<loc>[^<]*<\/loc><changefreq>/.test(sitemap), 'sitemap has URLs without lastmod');
  const sale = await fetch(`${base}/sale`);
  expect(sale.status === 404, `Empty sale section must not index as a sale page, received ${sale.status}`);

  if (errors.length) {
    console.error(`${errors.length} problem(s):\n${errors.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`SEO verification passed: ${products.length} products, ${titles.size} unique titles, ${descriptions.size} unique descriptions, price parity across HTML/JSON-LD/llms.txt/API.`);
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
