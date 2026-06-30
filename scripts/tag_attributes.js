// Разовый скрипт: проставляет category/material/color товарам по ключевым словам
// из названия. Не перезаписывает уже заполненные (вручную в админке) значения.
'use strict';
const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, '..', 'server', 'data', 'products.json');

const CATEGORY_RULES = [
  ['брелок', 'Брелок'],
  ['часы', 'Часы'], ['будильник', 'Часы'],
  ['визитниц', 'Визитница'],
  ['открывалк', 'Открывалка'],
  ['набор', 'Набор'],
  ['портфель', 'Портфель'], ['порфель', 'Портфель'],
  ['папка', 'Папка'],
  ['зеркало', 'Зеркало'],
  ['зонт', 'Зонт'],
  ['сумка', 'Сумка'],
  ['авторучка', 'Авторучка'], ['ручк', 'Авторучка'],
  ['футляр', 'Футляр'],
  ['держатель', 'Подставка'], ['подставка', 'Подставка'], ['подставку', 'Подставка'],
  ['бэдж', 'Бэдж'],
  ['глобус', 'Глобус'],
  ['метеостанц', 'Метеостанция'],
  ['радиоприемник', 'Радиоприёмник'], ['радиоприёмник', 'Радиоприёмник'],
  ['usb', 'USB'],
  ['косметичка', 'Косметичка'],
  ['кружк', 'Посуда'], ['термос', 'Посуда'], ['тарелк', 'Посуда'],
  ['платок', 'Платок'],
  ['игрушка', 'Игрушка'],
  ['бинокль', 'Бинокль'],
  ['калькулятор', 'Калькулятор'],
  ['чехол', 'Чехол'],
  ['подушк', 'Подушка'],
];

const MATERIAL_RULES = [
  ['металл', 'Металл'],
  ['пластик', 'Пластик'],
  ['дерев', 'Дерево'],
  ['кожзам', 'Кожзам'],
  ['кожа', 'Кожа'], ['кожан', 'Кожа'],
  ['пвх', 'ПВХ'],
  ['акрил', 'Акрил'],
  ['нейлон', 'Нейлон'],
  ['стекл', 'Стекло'],
  ['polyester', 'Полиэстер'], ['полиэстер', 'Полиэстер'],
];

const COLOR_RULES = [
  ['серебр', 'Серебро'],
  ['золот', 'Золото'],
  ['черн', 'Чёрный'],
  ['син', 'Синий'],
  ['бел', 'Белый'],
  ['зелен', 'Зелёный'],
  ['красн', 'Красный'],
  ['оранж', 'Оранжевый'],
  ['коричн', 'Коричневый'],
  ['прозрачн', 'Прозрачный'],
  ['сер', 'Серый'],
];

function matchFirst(name, rules) {
  const lower = name.toLowerCase();
  for (const [key, label] of rules) {
    if (lower.includes(key)) return label;
  }
  return '';
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

const products = readJSON(PRODUCTS_FILE, []);
let tagged = { category: 0, material: 0, color: 0 };

for (const p of products) {
  if (!p.category) {
    p.category = matchFirst(p.name, CATEGORY_RULES) || 'Прочее';
    tagged.category++;
  }
  if (!p.material) {
    const m = matchFirst(p.name, MATERIAL_RULES);
    if (m) { p.material = m; tagged.material++; }
    else if (p.material === undefined) p.material = '';
  }
  if (!p.color) {
    const c = matchFirst(p.name, COLOR_RULES);
    if (c) { p.color = c; tagged.color++; }
    else if (p.color === undefined) p.color = '';
  }
}

writeJSON(PRODUCTS_FILE, products);

console.log(`Обработано товаров: ${products.length}`);
console.log(`Проставлено category: ${tagged.category}, material: ${tagged.material}, color: ${tagged.color}`);
