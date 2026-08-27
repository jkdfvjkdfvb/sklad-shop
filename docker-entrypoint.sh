#!/bin/sh
# Первичное наполнение тома данных.
#
# Приложение ждёт в DATA_DIR готовые products.json, contacts.json и orders.json —
# без них каталог товаров пуст. В образе эти файлы лежат в server/data как
# исходный набор, но DATA_DIR — это том, и при первом запуске он пустой.
#
# Копируем только недостающие файлы и только один раз: если товар отредактирован
# через админку, перезапуск контейнера не должен откатить его к исходному
# состоянию. Поэтому проверка идёт по каждому файлу отдельно, а не по факту
# «том пустой».
set -eu

SEED_DIR=/app/server/data
DATA_DIR="${DATA_DIR:-/data}"

mkdir -p "$DATA_DIR/uploads/images" "$DATA_DIR/uploads/media"

if [ -d "$SEED_DIR" ]; then
  for SRC in "$SEED_DIR"/*.json; do
    [ -e "$SRC" ] || continue
    NAME="$(basename "$SRC")"
    if [ ! -e "$DATA_DIR/$NAME" ]; then
      cp "$SRC" "$DATA_DIR/$NAME"
      echo "entrypoint: перенесён исходный $NAME"
    fi
  done
fi

exec "$@"
