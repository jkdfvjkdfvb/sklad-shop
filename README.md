# СкладПромо — Интернет-магазин

Интернет-магазин промо-товаров с витриной, корзиной, оформлением заказов и административной панелью.

---

## Быстрый старт (локально)

```bash
npm install
npm start
```

| URL | Описание |
|---|---|
| http://localhost:3000 | Витрина магазина |
| http://localhost:3000/product/:slug | Страница товара (ЧПУ, SEO) |
| http://localhost:3000/sitemap.xml | XML-карта сайта |
| http://localhost:3000/robots.txt | robots.txt |
| http://localhost:3000/llms.txt | Обзор каталога для AI-краулеров |
| http://localhost:3000/feeds/google.xml | Товарный фид Google Merchant (Shopping) |
| http://localhost:3000/feeds/yandex.yml | Товарный фид Яндекс.Вебмастер (YML) |
| http://localhost:3000/admin.html | Административная панель |

Пароль по умолчанию: `admin123`

---

## Дизайн

Витрина оформлена по дизайн-системе в стиле Nike ([`DESIGN-nike.md`](DESIGN-nike.md)): монохромный интерфейс (чёрный `#111` / белый / один серый `#f5f5f5`), CTA-пилюли, плоские карточки товаров без теней и скруглений (фото на сером фоне), крупный uppercase-заголовок кампании (Bebas Neue) и Inter для интерфейса. Цвет вне фото используется только для сигналов (распродажа/наличие). Применено к главной и страницам товаров; админ-панель сохраняет свой служебный стиль.

---

## Возможности витрины

- Каталог 69 товаров с фильтрами по категории, материалу и цвету (чекбоксы, OR внутри группы, AND между группами)
- Счётчики значений в фильтрах; группы с более чем 6 вариантами сворачиваются
- Иконки SVG у каждого значения фильтра; цветовые точки у фильтра по цвету
- Сортировка по цене и количеству
- Поиск по названию и артикулу
- Цена в карточке и на странице товара — **ровно та, что указана в админке** (поле «Цена, ₽»), без наценки. Кнопка «Запросить оптовые условия» на странице товара — лид уходит в админку (вкладка «Заявки на опт») и в подключённый Telegram-бот
- Страница каждого товара с ЧПУ-адресом (`/product/:slug`) — server-side rendering для поисковиков
- Корзина (localStorage), оформление заказа, форма с именем и телефоном. Поле телефона — маска `+7XXXXXXXXXX`: только цифры, автоформатирование при вводе, валидация на клиенте и сервере (та же маска — на форме заказа и на форме «Запросить оптовые условия»)

---

## Возможности админки

- **Заказы:** список, статусы (новый / в работе / выполнен), модалка с деталями заказа
- **Заявки на опт:** лиды с кнопки «Запросить оптовые условия» на странице товара — товар, имя, контакт, комментарий; статусы (новая / обработана), удаление; при поступлении новой заявки — уведомление в Telegram
- **Товары:** инлайн-редактирование цены, кол-ва, видимости; загрузка фото/видео и отдельного фото для товарных фидов (обложка/инфографика — заменяет обычное фото только в `/feeds/google.xml` и `/feeds/yandex.yml`)
- **Товары:** модалка редактирования — **артикул** (переименование, с проверкой уникальности), фото, название, описание, категория, материал, цвет, **SEO-заголовок и мета-описание**
- **Товары:** создание нового товара («+ Новый товар» — создаёт пустую карточку со сгенерированным артикулом и сразу открывает её на редактирование)
- **Товары:** копирование товара (новый артикул `<артикул>-copy`, фото/видео копируются)
- **Товары:** удаление товара (с подтверждением)
- **Товары:** чекбоксы + «выбрать все», массовое сохранение и массовое удаление
- **Контакты:** редактирование hero-баннера (заголовок и подзаголовок), контактных данных и ссылок на соцсети
- **Фиды:** ссылки на товарные фиды и карту сайта (открыть / скопировать для подачи в Merchant Center и Яндекс.Вебмастер) и кнопка «Проверить фиды» — подтверждает, что правки в товарах попали в фид (число товаров + время проверки)
- **Уведомления:** настройка email (Gmail SMTP) и Telegram-бота для оповещений о заказах

---

## SEO и AI-оптимизация страниц товаров

Каждый товар имеет собственную страницу с человекочитаемым ЧПУ-адресом
(`/product/транслит-названия-АРТИКУЛ`, напр. `/product/avtoruchka-v-futlyare-krasnoe-derevo-140812`), которую рендерит сервер:

- **ЧПУ-адрес** с транслитерацией названия; старые ссылки `/product/АРТИКУЛ` отдают **301-редирект** на актуальный ЧПУ (сохраняется индекс и ссылочный вес)
- `<title>` (авто): `Купить {название} в СПб — {цена} ₽, в наличии {N} шт.` — интент, гео, цена и наличие; длина подгоняется под ~60 символов
- `<meta name="description">` (авто): полный коммерческий контекст — «Купить … в Санкт-Петербурге оптом и в розницу. Цена … ₽, в наличии N шт. Доставка по России.»
- Open Graph теги (`og:title`, `og:description`, `og:image`, `og:url`), `<link rel="canonical">` (на ЧПУ)
- JSON-LD: **Product** + **Offer** (цена, наличие, артикул, категория, изображение) и **BreadcrumbList**
- Microdata `itemprop` прямо в HTML
- Поля `meta_title` / `meta_description` (кастомные) редактируются в модалке товара в админке и перекрывают авто-генерацию
- **`/sitemap.xml`** (главная + все товары в наличии), **`/robots.txt`**, **`/llms.txt`** (обзор каталога с ценами и наличием для AI-краулеров и ответных нейросетей)
- **Товарные фиды** для загрузки в кабинеты вебмастеров:
  - **`/feeds/google.xml`** — Google Merchant Center / Google Shopping (RSS 2.0, namespace `g:`)
  - **`/feeds/yandex.yml`** — Яндекс.Вебмастер «Товары и цены» / Яндекс.Маркет (YML, `yml_catalog`)
  - Оба фида генерируются из каталога (цена, наличие, ЧПУ-ссылки, изображения) и всегда актуальны; ссылки на них указываются в кабинетах один раз. On-page разметку JSON-LD **Product/Offer/BreadcrumbList** Google Search Console считывает со страниц автоматически.
  - Все ссылки в фидах (товар, изображение) строятся от **домена, с которого фид фактически запросили** (`req.get('host')`), а не от фиксированного `SITE_URL` — так фид сразу рабочий и через технический домен хостинга, и через основной домен, без переключения в коде.
  - Для каждого товара можно загрузить **отдельное фото для фида** (обложка/инфографика) в админке — вкладка «Товары» → колонка «Медиа» → «🖼️ Фото для фида». Если оно загружено, фиды используют именно его вместо обычного фото товара; на странице товара по-прежнему показывается обычное фото.

---

## Первичный импорт данных

Товары и фотографии уже включены в репозиторий (`server/data/products.json`, `public/images/`).

Если нужно перегенерировать из исходных файлов (`Контент/`):

```bash
pip install -r scripts/requirements.txt
python scripts/import_data.py
```

Скрипт читает `Склад_2019_Sale_Опт.xls` и извлекает фотографии из `Технологика_распродажа.pdf`.

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3000` | Порт сервера |
| `ADMIN_PASSWORD` | `admin123` | Пароль для входа в админку |
| `SITE_URL` | `https://skladpromo.ru` | Основной HTTPS-домен для canonical, Open Graph, sitemap и товарных фидов |

---

## Деплой

**Сайт больше не на Railway.** Railway использовался до 27.08.2026; с этой даты
salegifts.ru работает на собственном VPS Timeweb (Docker Compose, nginx общий с
соседним проектом `avtoservice` на том же сервере). Оставшийся в репозитории
`railway.toml` был мёртвым файлом с самого первого коммита и не отражал
реальный деплой — удалён; если он всплывёт в истории или в старой ветке,
это не инструкция к действию.

Текущая схема:

- **Сервер:** VPS Timeweb, Docker Compose. Каталог `/opt/sklad` **не является
  git-репозиторием** — код туда попадает архивом (`git archive HEAD`), не
  через `git pull`.
- **nginx общий с соседним проектом.** vhost для salegifts.ru лежит в
  `/opt/nginx-vhosts/salegifts.conf`, живёт в контейнере `avtoservice-nginx-1`
  из соседнего compose-проекта. Порты 80/443 занимает только он. Любое
  изменение `deploy/nginx-salegifts.conf` перед `reload` обязано пройти
  `docker exec avtoservice-nginx-1 nginx -t` — битый конфиг положит и соседний
  сайт тоже.
- **Данные — в именованном Docker-томе** `sklad-data`, смонтированном в
  `/data` (см. `docker-compose.yml`). Пересборка образа его не трогает; см.
  «Персистентность данных» ниже.
- **Порядок выкатки:** `git archive` → `scp` архива на сервер → распаковка
  поверх `/opt/sklad` → (если менялся nginx-конфиг) `nginx -t` до reload →
  `docker compose up -d --build` → `docker exec avtoservice-nginx-1 nginx -s
  reload`.
- Shell-скрипты в архиве обязаны быть в LF (`.gitattributes` это закрепляет:
  `*.sh text eol=lf`) — CRLF в shebang `docker-entrypoint.sh` делает
  интерпретатором несуществующий `/bin/sh\r`, и контейнер уходит в цикл
  перезапуска.

> **Важно:** токены сессии AdminPanel хранятся в памяти сервера и сбрасываются
> при каждом деплое/перезапуске. После деплоя нужно войти заново.

### SEO-проверка перед публикацией

- `SITE_URL` в `.env` на сервере должен содержать конечный основной
  HTTPS-домен (`https://salegifts.ru`) — canonical, sitemap и товарные фиды
  строятся от него.
- SEO-метаданные 69 SKU находятся в docs/product-meta-tags.csv; импорт
  выполняется скриптом node scripts/import-product-meta.js.
- Проверка server-rendered карточек, категорий, sitemap и robots:
  `node scripts/verify-seo.js` (локально — против `preview_start` на порту
  3000/3101; на проде — `SEO_TEST_BASE=https://salegifts.ru node
  scripts/verify-seo.js`). Локальный `server/data/products.json` может
  отставать от боевых цен/остатков/видимости, которые правятся через
  админку независимо от git — при расхождении верить проду, а не локальному
  файлу.
- `/sale/` появляется только при товарах с заполненными старой и новой ценой,
  размером скидки и условиями/сроком акции.

---

## Структура проекта

```
public/
  index.html          — витрина
  admin.html          — административная панель
  admin-help.html     — инструкция для администратора
  css/
    style.css         — стили витрины
    admin.css         — стили админки
    product.css       — стили страниц товаров
  js/
    shop.js           — логика витрины, фильтров, сортировки и корзины
    admin.js          — логика административной панели
    product.js        — логика страниц товаров (корзина, заказ)
  images/             — фотографии товаров
  media/              — видеофайлы товаров

server/
  server.js           — Express API + SSR страниц товаров
  seo.js              — SEO/AEO-роуты: карточки, категории, sitemap и robots
  data/
    products.json     — база товаров
    contacts.json     — контакты, hero-баннер и настройки уведомлений
    orders.json       — история заказов

scripts/
  import_data.py      — разовый импорт из xls + pdf
  tag_attributes.js   — авто-проставление category/material/color по названиям
  import-product-meta.js — импорт H1, Title, description и кластера для 69 SKU
  verify-seo.js       — проверка SSR-метаданных и структурированных данных
  requirements.txt    — Python-зависимости для импорта
```

---

## API

### Публичные эндпоинты

| Метод | URL | Описание |
|---|---|---|
| GET | `/product/:slug` | Страница товара (SSR, ЧПУ, SEO); старый `/product/:article` → 301 на ЧПУ |
| GET | `/category/:slug` | SEO-страница товарной категории |
| GET | `/sale/` | Распродажа только товаров с подтверждёнными условиями скидки |
| GET | `/sitemap.xml` | XML-карта сайта (главная + товары) |
| GET | `/robots.txt` | robots.txt |
| GET | `/llms.txt` | Обзор каталога для AI-краулеров |
| GET | `/feeds/google.xml` | Товарный фид Google Merchant (RSS 2.0, `g:`) |
| GET | `/feeds/yandex.yml` | Товарный фид Яндекс.Вебмастер (YML) |
| GET | `/api/products` | Список товаров в наличии (с полем `slug`) |
| GET | `/api/contacts` | Контактные данные и hero-баннер |
| POST | `/api/order` | Оформить заказ |
| POST | `/api/wholesale-request` | Запрос оптовых условий по карточке товара |

### Административные эндпоинты (требуют заголовок `x-admin-token`)

| Метод | URL | Описание |
|---|---|---|
| POST | `/api/login` | Вход, получение токена |
| POST | `/api/logout` | Выход |
| GET | `/api/admin/products` | Все товары |
| POST | `/api/admin/products` | Создать новый товар (тело `{ article? }` — если не задан, генерируется placeholder) |
| PUT | `/api/admin/products/:article` | Изменить товар (артикул через `new_article`, цена, кол-во, видимость, название, описание, категория, материал, цвет, SEO-теги) |
| DELETE | `/api/admin/products/:article` | Удалить товар |
| POST | `/api/admin/products/:article/duplicate` | Скопировать товар |
| POST | `/api/admin/products/:article/image` | Загрузить фото товара |
| POST | `/api/admin/products/:article/video` | Загрузить видео |
| POST | `/api/admin/products/:article/feed-image` | Загрузить отдельное фото для фидов (обложка/инфографика) |
| DELETE | `/api/admin/products/:article/feed-image` | Удалить фото для фида (фид вернётся к обычному фото) |
| PUT | `/api/admin/products/bulk` | Массово изменить цену/кол-во/видимость |
| POST | `/api/admin/products/bulk-delete` | Массово удалить товары |
| GET | `/api/admin/orders` | Все заказы |
| PUT | `/api/admin/orders/:id` | Изменить статус заказа |
| GET | `/api/admin/wholesale-requests` | Все заявки на опт |
| PUT | `/api/admin/wholesale-requests/:id` | Изменить статус заявки (новая/обработана) |
| DELETE | `/api/admin/wholesale-requests/:id` | Удалить заявку |
| GET | `/api/admin/contacts` | Контакты + настройки уведомлений |
| PUT | `/api/admin/contacts` | Обновить контакты, hero-баннер, уведомления |
| GET | `/api/admin/feeds/status` | Статус фидов (число товаров, время генерации) |

---

## Зависимости

| Пакет | Назначение |
|---|---|
| express | HTTP-сервер, API и SSR страниц товаров |
| multer | Загрузка файлов |
| nodemailer | Отправка email-уведомлений |


## Persistent data (Docker volume, not Railway)

In production the app runs under Docker Compose with a named volume,
`sklad-data`, mounted at `/data` (`DATA_DIR=/data`, set in the server's
`.env`) — see `docker-compose.yml`. `docker-entrypoint.sh` seeds an empty
volume once from `server/data`, copying each `*.json` file only if it doesn't
already exist at the destination; contacts, products, and orders saved
through the admin panel are never overwritten by a redeploy, because the
image's copy of `server/data` is irrelevant once the volume already has its
own file.

The same volume also stores files uploaded through the admin panel:
`${DATA_DIR}/uploads/images` and `${DATA_DIR}/uploads/media`. On first boot
each is seeded once from `public/images` / `public/media` (the git-tracked
seed photos), then anything uploaded afterwards is served from the volume
with priority over the seed files, so it survives redeploys — including the
images referenced by the Google Merchant (`/feeds/google.xml`,
`<g:image_link>`) and Яндекс.Вебмастер (`/feeds/yandex.yml`, `<picture>`)
feeds.

This is unrelated to Railway — there is no Railway Volume in the current
setup. If you see "Railway Volume" in an old comment or commit message, it
describes the pre-27.08.2026 hosting and does not apply anymore.
