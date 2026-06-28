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
| http://localhost:3000/admin.html | Административная панель |

Пароль по умолчанию: `admin123`

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

---

## Деплой на Railway

1. Создайте репозиторий на GitHub и загрузите код
2. Зайдите на [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Укажите порт `3000` когда Railway спросит
4. В **Variables** добавьте `ADMIN_PASSWORD` и `PORT=3000`
5. В **Settings → Networking → Generate Domain** получите публичный URL

> **Важно:** для сохранения загруженных через админку фото и видео добавьте Railway Volume с путём `/app/public`. Иначе файлы сбросятся при следующем деплое.

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
  js/
    shop.js           — логика витрины и корзины
    admin.js          — логика административной панели
  images/             — фотографии товаров
  media/              — видеофайлы товаров

server/
  server.js           — Express API
  data/
    products.json     — база товаров
    contacts.json     — контакты и настройки уведомлений
    orders.json       — история заказов

scripts/
  import_data.py      — разовый импорт из xls + pdf
  requirements.txt    — Python-зависимости для импорта
```

---

## API

### Публичные эндпоинты

| Метод | URL | Описание |
|---|---|---|
| GET | `/api/products` | Список товаров в наличии |
| GET | `/api/contacts` | Контактные данные |
| POST | `/api/order` | Оформить заказ |

### Административные эндпоинты (требуют заголовок `x-admin-token`)

| Метод | URL | Описание |
|---|---|---|
| POST | `/api/login` | Вход, получение токена |
| POST | `/api/logout` | Выход |
| GET | `/api/admin/products` | Все товары |
| PUT | `/api/admin/products/:article` | Изменить цену/кол-во/видимость/видео |
| POST | `/api/admin/products/:article/image` | Загрузить фото |
| POST | `/api/admin/products/:article/video` | Загрузить видео |
| GET | `/api/admin/orders` | Все заказы |
| PUT | `/api/admin/orders/:id` | Изменить статус заказа |
| GET | `/api/admin/contacts` | Контакты + настройки уведомлений |
| PUT | `/api/admin/contacts` | Обновить контакты / уведомления |

---

## Зависимости

| Пакет | Назначение |
|---|---|
| express | HTTP-сервер и API |
| multer | Загрузка файлов |
| nodemailer | Отправка email-уведомлений |
