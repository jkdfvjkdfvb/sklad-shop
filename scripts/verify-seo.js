'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const products = JSON.parse(fs.readFileSync(path.join(root, 'server/data/products.json'), 'utf8'));
const meta = fs.readFileSync(path.join(root, 'docs/product-meta-tags.csv'), 'utf8').trim().split(/\r?\n/)
  .slice(1).map(line => { const [url, article, h1, title, meta_description, target_cluster] = line.split(';'); return { url, article, h1, title, meta_description, target_cluster }; });
const metaByArticle = new Map(meta.map(row => [row.article, row]));
const base = process.env.SEO_TEST_BASE || 'http://127.0.0.1:3101';
const canonicalBase = 'https://skladpromo.ru';
const errors = [];

function expect(condition, message) { if (!condition) errors.push(message); }
function extract(html, pattern) { return (html.match(pattern) || [])[1] || ''; }
function productLdFrom(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
  return scripts.find(value => value['@type'] === 'Product');
}

(async () => {
  expect(products.length === 69, `Expected 69 products, received ${products.length}`);
  expect(meta.length === 69, `Expected 69 CSV rows, received ${meta.length}`);
  const titles = new Set();
  const descriptions = new Set();

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
    const ld = productLdFrom(html);
    const stock = Number(product.stock_qty);
    const price = Number(product.retail_price);

    expect(response.status === 200, `${product.article}: expected 200, received ${response.status}`);
    expect(title === csv.title, `${product.article}: title differs from CSV`);
    expect(description === csv.meta_description, `${product.article}: description differs from CSV`);
    expect(h1 === csv.h1, `${product.article}: H1 differs from CSV`);
    expect(canonical === `${canonicalBase}/product/${product.slug}`, `${product.article}: canonical is not canonical HTTPS URL`);
    expect(ogUrl === canonical, `${product.article}: og:url differs from canonical`);
    expect(html.includes(`В наличии: ${stock} шт.`), `${product.article}: visible stock is missing or stale`);
    expect(html.includes(`${price.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ₽`), `${product.article}: visible price is missing or stale`);
    expect(html.includes(description), `${product.article}: description is not visible in HTML`);
    expect(!/СПб|в Санкт-Петербурге/i.test(title) && !/СПб|в Санкт-Петербурге/i.test(description), `${product.article}: artificial regional metadata remains`);
    expect(!/[.…]{1,3}/.test(title), `${product.article}: title is truncated`);
    expect(!/<link rel="canonical" href="http:\/\//.test(html), `${product.article}: HTTP canonical`);
    expect(ld && ld.name === csv.h1, `${product.article}: Product JSON-LD name differs from H1`);
    expect(ld && Number(ld.offers.price) === price, `${product.article}: Product JSON-LD price differs`);
    expect(ld && ld.offers.availability === 'https://schema.org/InStock', `${product.article}: Product JSON-LD availability differs`);
    expect(ld && ld.offers.url === canonical, `${product.article}: Product JSON-LD URL differs`);
    expect(ld && !ld.brand, `${product.article}: unknown brand is emitted`);
    titles.add(title); descriptions.add(description);
  }

  expect(titles.size === 69, `Titles are not unique (${titles.size}/69)`);
  expect(descriptions.size === 69, `Descriptions are not unique (${descriptions.size}/69)`);
  for (const slug of ['breloki', 'chasy-i-budilniki', 'vizitnicy', 'papki', 'portfeli', 'otkryvalki', 'nabory-dlya-vina', 'usb-haby', 'dorozhnye-tovary', 'ofisnye-aksessuary']) {
    const response = await fetch(`${base}/category/${slug}`);
    expect(response.status === 200, `Category ${slug}: expected 200, received ${response.status}`);
  }
  const home = await (await fetch(`${base}/`)).text();
  expect(home.includes('Сувенирная продукция и бизнес-подарки со склада'), 'Home H1 is missing');
  expect(!home.includes('+7 (000)') && !home.includes('t.me/username') && !home.includes('vk.com/username'), 'Test contacts are exposed on home');
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  expect(robots.includes(`${canonicalBase}/sitemap.xml`), 'robots.txt does not use canonical sitemap URL');
  expect(sitemap.includes(`${canonicalBase}/product/`), 'sitemap has no canonical product URLs');
  expect(!/<loc>http:\/\//.test(sitemap), 'sitemap contains HTTP page URLs');
  const sale = await fetch(`${base}/sale/`);
  expect(sale.status === 404, `Empty sale section must not index as a sale page, received ${sale.status}`);

  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`SEO verification passed: ${products.length} products, ${titles.size} unique titles and ${descriptions.size} unique descriptions.`);
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
