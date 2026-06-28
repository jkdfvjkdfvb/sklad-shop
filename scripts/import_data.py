# -*- coding: utf-8 -*-
"""
Импорт товаров из Склад_2019_Sale_Опт.xls и фото из Технологика_распродажа.pdf.
Создаёт server/data/products.json и public/images/<артикул>.<ext>.
"""
import os, sys, json, re, shutil

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)
CONTENT_DIR = os.path.join(ROOT, "Контент")
XLS_FILE = os.path.join(CONTENT_DIR, "Склад_2019_Sale_Опт.xls")
PDF_FILE = os.path.join(CONTENT_DIR, "Технологика_распродажа.pdf")
IMG_OUT = os.path.join(ROOT, "public", "images")
DATA_OUT = os.path.join(ROOT, "server", "data")
PRODUCTS_JSON = os.path.join(DATA_OUT, "products.json")
CONTACTS_JSON = os.path.join(DATA_OUT, "contacts.json")

os.makedirs(IMG_OUT, exist_ok=True)
os.makedirs(DATA_OUT, exist_ok=True)

# --- 1. Читаем базу из xls ---
try:
    import xlrd
except ImportError:
    sys.exit("Установите зависимости: pip install -r scripts/requirements.txt")

book = xlrd.open_workbook(XLS_FILE)
sheet = book.sheet_by_index(0)

db = {}  # article_str -> {name, qty, price}
for r in range(1, sheet.nrows):
    art_raw = sheet.cell_value(r, 0)
    name = str(sheet.cell_value(r, 1)).strip()
    qty_raw = sheet.cell_value(r, 2)
    price_raw = sheet.cell_value(r, 3)
    if not art_raw or not name:
        continue
    art = str(int(art_raw)) if isinstance(art_raw, float) else str(art_raw).strip()
    qty = int(qty_raw) if qty_raw else 0
    price = round(float(price_raw)) if price_raw else 0
    db[art] = {"name": name, "qty": qty, "price": price}

print(f"[xls] Товаров в базе: {len(db)}")

# --- 2. Читаем PDF и извлекаем фото ---
try:
    import fitz
except ImportError:
    sys.exit("Установите зависимости: pip install -r scripts/requirements.txt")

doc = fitz.open(PDF_FILE)
matched = {}   # article -> img_bytes, ext
skipped_imgs = 0

for page_num in range(doc.page_count):
    page = doc[page_num]
    full_text = page.get_text()

    # Собираем текстовые блоки с координатой центра и артикулом
    art_blocks = []
    for block in page.get_text("blocks"):
        text = block[4]
        arts = re.findall(r'\b(\d{6})\b', text)
        if arts:
            cx = (block[0] + block[2]) / 2
            cy = (block[1] + block[3]) / 2
            for a in arts:
                art_blocks.append((cx, cy, a))

    if not art_blocks:
        continue

    # Собираем уникальные изображения страницы по xref
    seen_xrefs = set()
    images_on_page = []
    for img_info in page.get_images(full=True):
        xref = img_info[0]
        if xref in seen_xrefs:
            continue
        seen_xrefs.add(xref)
        rects = page.get_image_rects(xref)
        if not rects:
            continue
        r = rects[0]
        # Пропускаем очень маленькие (иконки/фон) и очень большие (фон всей страницы)
        w = r.x1 - r.x0
        h = r.y1 - r.y0
        area = w * h
        page_area = page.rect.width * page.rect.height
        if area < 3000 or area > page_area * 0.6:
            skipped_imgs += 1
            continue
        cx_img = (r.x0 + r.x1) / 2
        cy_img = (r.y0 + r.y1) / 2
        images_on_page.append((cx_img, cy_img, xref))

    # Сопоставляем каждый арт-блок к ближайшей картинке
    for (ax, ay, art) in art_blocks:
        if art in matched:
            continue
        if not images_on_page:
            continue
        best = min(images_on_page, key=lambda img: (img[0]-ax)**2 + (img[1]-ay)**2)
        xref = best[2]
        pix_dict = doc.extract_image(xref)
        ext = pix_dict.get("ext", "png")
        img_bytes = pix_dict["image"]
        matched[art] = (img_bytes, ext)

print(f"[pdf]  Сопоставлено артикулов с фото: {len(matched)}")

# --- 3. Сохраняем изображения и формируем products.json ---
products = []
saved = 0
no_db = 0
for art, (img_bytes, ext) in matched.items():
    if art not in db:
        no_db += 1
        continue
    fname = f"{art}.{ext}"
    fpath = os.path.join(IMG_OUT, fname)
    with open(fpath, "wb") as f:
        f.write(img_bytes)
    row = db[art]
    products.append({
        "article": art,
        "name": row["name"],
        "qty": row["qty"],
        "price": row["price"],
        "image": f"images/{fname}",
        "video": "",
        "visible": True
    })
    saved += 1

products.sort(key=lambda p: p["article"])

with open(PRODUCTS_JSON, "w", encoding="utf-8") as f:
    json.dump(products, f, ensure_ascii=False, indent=2)

print(f"[out]  Товаров сохранено в products.json: {saved}")
if no_db:
    print(f"[warn] Артикулов из PDF не найдено в базе: {no_db}")
print(f"[info] Пропущено мелких/фоновых изображений: {skipped_imgs}")

# --- 4. Контакты (заглушки) ---
if not os.path.exists(CONTACTS_JSON):
    contacts = {
        "phone": "+7 (000) 000-00-00",
        "email": "shop@example.com",
        "max": "https://max.ru/",
        "telegram": "https://t.me/username",
        "vk": "https://vk.com/username"
    }
    with open(CONTACTS_JSON, "w", encoding="utf-8") as f:
        json.dump(contacts, f, ensure_ascii=False, indent=2)
    print("[out]  contacts.json создан (заглушки — заполните в админке)")
else:
    print("[info] contacts.json уже существует, не перезаписываем")

print("\nГотово! Запустите: npm start")
