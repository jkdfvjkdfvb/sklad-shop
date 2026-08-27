# Приложение крошечное: Express и три зависимости. Alpine выбран ради размера
# образа — на VPS с 3.8 ГБ памяти и общим диском лишние сотни мегабайт ни к чему.
FROM node:22-alpine

WORKDIR /app

# Зависимости отдельным слоем: package.json меняется редко, а исходники часто,
# поэтому пересборка после правки кода не будет каждый раз тянуть npm.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY server ./server
COPY public ./public

# Каталог данных — точка монтирования тома. Внутри образа он пустой:
# products.json, orders.json и загруженные файлы должны пережить пересборку,
# поэтому живут в томе, а не в слоях образа.
RUN mkdir -p /data && chown -R node:node /data /app

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Работаем не от root: приложение принимает загрузки файлов через multer,
# и цена ошибки в обработке загрузки не должна включать права суперпользователя.
USER node

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/server.js"]
