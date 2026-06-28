# СкладПромо — Интернет-магазин

Интернет-магазин промо-товаров с витриной и админкой.

## Быстрый старт (локально)

```bash
npm install
npm start
```

Открыть: http://localhost:3000  
Админка: http://localhost:3000/admin.html  
Пароль по умолчанию: `admin123`

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3000` | Порт сервера |
| `ADMIN_PASSWORD` | `admin123` | Пароль для входа в админку |

## Первичный импорт данных

Импорт запускается один раз, данные уже включены в репозиторий.  
Если нужно перегенерировать из исходных файлов:

```bash
pip install -r scripts/requirements.txt
python scripts/import_data.py
```

## Деплой на Railway

1. Создайте репозиторий на GitHub и загрузите код
2. Зайдите на [railway.app](https://railway.app), новый проект → «Deploy from GitHub»
3. Выберите репозиторий, Railway автоматически определит Node.js
4. В настройках переменных укажите `ADMIN_PASSWORD=ВашПароль`
5. Для сохранения загруженных файлов (фото/видео через админку) добавьте Volume в Railway: `/app/public`

## Структура

```
public/          — статика (витрина + админка)
  images/        — фото товаров
  media/         — видео товаров
  css/           — стили
  js/            — JavaScript
server/
  server.js      — Express API
  data/
    products.json — база товаров
    contacts.json — контакты
scripts/
  import_data.py — разовый импорт из xls + pdf
```
