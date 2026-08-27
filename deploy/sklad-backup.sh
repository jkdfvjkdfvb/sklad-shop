#!/bin/sh
# Ежедневный бэкап данных «Склада».
#
# У проекта нет базы: товары, заказы, оптовые заявки и загруженные через
# админку фото лежат JSON-файлами и картинками в томе sklad-data. Том переживает
# пересборку образа, но не переживёт `docker volume rm`, ошибку в админке или
# отказ диска — поэтому нужна копия за пределами тома.
#
# Архив снимается из работающего контейнера. Приложение пишет файлы целиком
# (перезапись, не дозапись), так что попасть в момент частичной записи почти
# невозможно; ради простоты контейнер не останавливаем — минута недоступности
# магазина дороже этого риска.
set -eu

BACKUP_DIR="/var/backups/sklad"
CONTAINER="sklad-app-1"
KEEP_DAYS=14
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_DIR/sklad-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "sklad-backup: контейнер $CONTAINER не найден" >&2
  exit 1
fi

# tar пишется в stdout контейнера и складывается в файл на хосте: так копия
# сразу оказывается вне тома, а не внутри него.
docker exec "$CONTAINER" tar -czf - -C /data . > "$ARCHIVE"

SIZE="$(stat -c%s "$ARCHIVE" 2>/dev/null || echo 0)"

# Пустой или подозрительно маленький архив — это не бэкап, а иллюзия бэкапа.
# Один products.json занимает больше 100 КБ, так что порог заведомо ниже
# нормального объёма и заведомо выше пустого архива.
if [ "$SIZE" -lt 10240 ]; then
  echo "sklad-backup: архив $ARCHIVE подозрительно мал ($SIZE байт), удаляю" >&2
  rm -f "$ARCHIVE"
  exit 1
fi

# Проверяем, что архив читается и содержит ключевой файл. Без этой проверки
# повреждённый архив обнаружился бы только в момент восстановления.
if ! tar -tzf "$ARCHIVE" >/dev/null 2>&1; then
  echo "sklad-backup: архив $ARCHIVE не читается, удаляю" >&2
  rm -f "$ARCHIVE"
  exit 1
fi
if ! tar -tzf "$ARCHIVE" 2>/dev/null | grep -q 'products.json'; then
  echo "sklad-backup: в архиве нет products.json — данные не попали" >&2
  exit 1
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'sklad-*.tar.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true

echo "sklad-backup: $ARCHIVE, $((SIZE / 1024)) КБ, копий в каталоге: $(find "$BACKUP_DIR" -maxdepth 1 -name 'sklad-*.tar.gz' | wc -l)"
