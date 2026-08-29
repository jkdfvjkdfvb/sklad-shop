'use strict';

/*
 * Imports the approved product SEO copy and normalises the fields used by the
 * server-rendered product template. Run with:
 *   node scripts/import-product-meta.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRODUCTS_FILE = path.join(ROOT, 'server', 'data', 'products.json');
const META_FILE = path.join(ROOT, 'docs', 'product-meta-tags.csv');

function parseSemicolonCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => {
    pushField();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ';' && !quoted) {
      pushField();
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field || row.length) pushRow();

  const [header, ...body] = rows;
  return body.map(values => Object.fromEntries(header.map((key, index) => [key, values[index] || ''])));
}

const CATEGORY_RULES = [
  [/^брелок/i, 'breloki', 'Брелоки'],
  [/метеостанц/i, 'meteostancii', 'Метеостанции'],
  [/(настольные часы|дорожн.*будильник|дорожные часы)/i, 'chasy-i-budilniki', 'Часы и будильники'],
  [/(визитниц|кредитных карт)/i, 'vizitnicy', 'Визитницы'],
  [/папк/i, 'papki', 'Папки'],
  [/портфел/i, 'portfeli', 'Портфели'],
  [/открывалк/i, 'otkryvalki', 'Открывалки'],
  [/набор для вина/i, 'nabory-dlya-vina', 'Наборы для вина'],
  [/usb hub/i, 'usb-haby', 'USB-хабы'],
  [/(дорожн|косметичк|подушк)/i, 'dorozhnye-tovary', 'Дорожные товары'],
  [/(калькулятор|куб для бумаги|подставк|тарелка для сдачи|радиоприёмник|бейдж)/i, 'ofisnye-aksessuary', 'Офисные аксессуары'],
  [/ручка в футляре/i, 'ruchki-v-futlyarah', 'Ручки в футлярах'],
  [/зонт/i, 'zonty', 'Зонты'],
  [/зеркало/i, 'aksessuary', 'Аксессуары'],
  [/глобус/i, 'nastolnye-aksessuary', 'Настольные аксессуары'],
  [/сумка/i, 'sumki', 'Сумки'],
  [/термокружк/i, 'termokruzhki', 'Термокружки'],
  [/бинокл/i, 'binokli', 'Бинокли'],
];

function categoryFor(meta, product) {
  const text = `${meta.target_cluster} ${meta.h1}`;
  const hit = CATEGORY_RULES.find(([pattern]) => pattern.test(text));
  if (hit) return { category_slug: hit[1], category_name: hit[2] };
  const fallback = String(product.category || 'catalog').toLowerCase()
    .replace(/[^а-яёa-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return { category_slug: fallback || 'catalog', category_name: product.category || 'Каталог' };
}

function priceText(value) {
  return Number(value).toLocaleString('ru-RU');
}

const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
const metaRows = parseSemicolonCsv(fs.readFileSync(META_FILE, 'utf8'));
const metaByArticle = new Map(metaRows.map(row => [row.article, row]));
const importedAt = new Date().toISOString();

if (metaByArticle.size !== 69 || products.length !== 69) {
  throw new Error(`Expected 69 products and 69 metadata rows; got ${products.length} and ${metaByArticle.size}.`);
}

for (const product of products) {
  const meta = metaByArticle.get(String(product.article));
  if (!meta) throw new Error(`Metadata is missing for article ${product.article}.`);

  const slug = new URL(meta.url).pathname.split('/').filter(Boolean).pop();
  // Цена = ровно значение из админки, без наценки.
  const retailPrice = Number(product.price);
  const metaDescriptionTemplate = meta.meta_description
    .replace(new RegExp(`${product.qty}\\s*шт\\.`, 'u'), '{{stock_qty}} шт.')
    .replace(`${priceText(retailPrice)} ₽`, '{{retail_price}} ₽');
  const category = categoryFor(meta, product);

  Object.assign(product, {
    id: String(product.article),
    slug,
    seo_name: meta.h1,
    short_name: meta.title.replace(/ — купить \| СкладПромо$/u, ''),
    meta_title: meta.title,
    meta_description_template: metaDescriptionTemplate,
    target_cluster: meta.target_cluster,
    ...category,
    dimensions_mm: product.dimensions_mm || '',
    weight_g: product.weight_g || '',
    package_contents: product.package_contents || '',
    compatibility: product.compatibility || '',
    retail_price: retailPrice,
    wholesale_price_from: Number(product.price),
    stock_qty: Number(product.qty),
    stock_updated_at: product.stock_updated_at || importedAt,
    image_urls: product.image ? [product.image] : [],
    video_url: product.video || '',
    manufacturer_or_brand: product.manufacturer_or_brand || '',
    is_sale: false,
    old_price: null,
    discount_percent: null,
    sale_start_at: '',
    sale_end_at: '',
    sale_terms: '',
    logo_service_available: false,
    logo_service_fulfilled_by_partner: false,
    logo_service_min_qty: null,
    logo_service_lead_time: '',
    logo_service_methods: [],
    seo_updated_at: product.seo_updated_at || importedAt,
    previous_slugs: Array.isArray(product.previous_slugs) ? product.previous_slugs : [],
  });
}

fs.writeFileSync(PRODUCTS_FILE, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
console.log(`Imported SEO metadata for ${products.length} products.`);
