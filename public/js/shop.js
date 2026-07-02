'use strict';

let allProducts = [];
let contacts = {};

// ======== PRICES ========
// Розничная цена рассчитывается от оптовой (текущая цена товара = оптовая).
const RETAIL_MULTIPLIER = 3;
function retailPrice(price) { return price * RETAIL_MULTIPLIER; }
function fmtPrice(v) { return v.toLocaleString('ru-RU') + ' ₽'; }

// ======== FILTER STATE ========
const selected = { category: new Set(), material: new Set(), color: new Set() };

// ======== SORT STATE ========
let sortState = { field: null, dir: 'asc' };

// ======== FILTER ICONS (SVG) ========
const FILTER_ICONS = {
  // categories
  'Брелок':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="5" r="2.5"/><line x1="8" y1="7.5" x2="8" y2="13"/><line x1="5.5" y1="11" x2="10.5" y2="11"/></svg>',
  'Часы':          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><polyline points="8,5 8,8 10,10"/></svg>',
  'Набор':         '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="5" width="12" height="9" rx="1.5"/><polyline points="5,5 5,3 11,3 11,5"/></svg>',
  'Визитница':     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="1" y="4" width="14" height="9" rx="1.5"/><line x1="1" y1="8" x2="15" y2="8"/></svg>',
  'Открывалка':    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="5" y1="13" x2="11" y2="3"/><path d="M11 3c1.5 0 2.5 1 2.5 2s-1 2-2.5 2"/></svg>',
  'Портфель':      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="6" width="12" height="8" rx="1.5"/><path d="M6 6V4.5A1.5 1.5 0 0 1 7.5 3h1A1.5 1.5 0 0 1 10 4.5V6"/><line x1="2" y1="10" x2="14" y2="10"/></svg>',
  'Папка':         '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 5a1 1 0 0 1 1-1h3.5l1.5 2H13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/></svg>',
  'Зеркало':       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><ellipse cx="8" cy="6.5" rx="4" ry="5"/><line x1="8" y1="11.5" x2="8" y2="14"/><line x1="6" y1="14" x2="10" y2="14"/></svg>',
  'Зонт':          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 2a7 7 0 0 0-7 6h14a7 7 0 0 0-7-6z"/><path d="M8 8v5a2 2 0 0 0 4 0"/></svg>',
  'Сумка':         '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="6" width="12" height="8" rx="1.5"/><path d="M5.5 6V4.5a2.5 2.5 0 0 1 5 0V6"/></svg>',
  'Авторучка':     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M10 2.5l3 3-7 7.5H3v-3L10 2.5z"/><line x1="8" y1="4.5" x2="11" y2="7.5"/></svg>',
  'Футляр':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="5" width="12" height="7" rx="3.5"/><line x1="2" y1="8.5" x2="14" y2="8.5"/></svg>',
  'Подставка':     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="3" width="10" height="6" rx="1"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="5" y1="13" x2="11" y2="13"/></svg>',
  'Бэдж':          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="4" width="10" height="10" rx="1.5"/><rect x="6" y="2" width="4" height="3" rx="1"/><line x1="6" y1="9" x2="10" y2="9"/></svg>',
  'Глобус':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 2c-2 2-2 8 0 12M8 2c2 2 2 8 0 12"/><line x1="2" y1="8" x2="14" y2="8"/></svg>',
  'Метеостанция':  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="7" r="3.5"/><line x1="8" y1="1" x2="8" y2="3.5"/><line x1="8" y1="10.5" x2="8" y2="13"/><line x1="1" y1="7" x2="3.5" y2="7"/><line x1="12.5" y1="7" x2="15" y2="7"/></svg>',
  'Радиоприёмник': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="6" width="12" height="8" rx="1.5"/><circle cx="6" cy="11" r="2"/><line x1="9" y1="8" x2="13" y2="8"/><line x1="9" y1="11" x2="13" y2="11"/><line x1="5.5" y1="4.5" x2="10.5" y2="2"/></svg>',
  'USB':           '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="11"/><line x1="5" y1="8" x2="11" y2="8"/><rect x="4" y="11" width="8" height="3" rx="1.5"/><line x1="6" y1="5" x2="6" y2="3"/><line x1="10" y1="7" x2="10" y2="5"/></svg>',
  'Косметичка':    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 7a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z"/><path d="M6.5 6V4.5a1.5 1.5 0 0 1 3 0V6"/><circle cx="8" cy="10" r="1.5"/></svg>',
  'Посуда':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 3v5a4 4 0 0 0 8 0V3"/><line x1="2" y1="3" x2="14" y2="3"/><line x1="8" y1="12" x2="8" y2="14"/><line x1="5" y1="14" x2="11" y2="14"/></svg>',
  'Платок':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 2h12v12L8 9 2 14V2z"/></svg>',
  'Игрушка':       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="6" r="3"/><path d="M5 9.5a5 5 0 0 0-2 4h10a5 5 0 0 0-2-4"/></svg>',
  'Бинокль':       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="10" r="3.5"/><circle cx="11" cy="10" r="3.5"/><path d="M5 6.5L6.5 4h3L11 6.5"/></svg>',
  'Калькулятор':   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="1" width="10" height="14" rx="1.5"/><rect x="5" y="3" width="6" height="3" rx=".5"/><circle cx="5.5" cy="9" r=".7" fill="currentColor" stroke="none"/><circle cx="8" cy="9" r=".7" fill="currentColor" stroke="none"/><circle cx="10.5" cy="9" r=".7" fill="currentColor" stroke="none"/><circle cx="5.5" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="10.5" cy="12" r=".7" fill="currentColor" stroke="none"/></svg>',
  'Чехол':         '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="4" y="1" width="8" height="14" rx="2"/><rect x="5.5" y="2.5" width="5" height="8" rx="1"/><line x1="7" y1="12.5" x2="9" y2="12.5"/></svg>',
  'Подушка':       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="1" y="5" width="14" height="7" rx="3.5"/><path d="M1 8.5c2.5-2 5-1.5 7 0s4.5 2 7 0"/></svg>',
  'Прочее':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="11" x2="8" y2="11" stroke-width="2.5"/><path d="M8 4.5a2 2 0 0 1 1 3.5c-.7.5-1 1-1 1.5"/></svg>',
  // materials
  'Металл':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><line x1="8" y1="1.5" x2="8" y2="4"/><line x1="8" y1="12" x2="8" y2="14.5"/><line x1="1.5" y1="8" x2="4" y2="8"/><line x1="12" y1="8" x2="14.5" y2="8"/><line x1="3.3" y1="3.3" x2="5.2" y2="5.2"/><line x1="10.8" y1="10.8" x2="12.7" y2="12.7"/><line x1="12.7" y1="3.3" x2="10.8" y2="5.2"/><line x1="5.2" y1="10.8" x2="3.3" y2="12.7"/></svg>',
  'Пластик':       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="5" width="10" height="7" rx="2"/><path d="M6 5V4M10 5V4"/><line x1="5" y1="9" x2="11" y2="9"/></svg>',
  'Дерево':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><polygon points="8,2 14,10 2,10"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="5.5" y1="14" x2="10.5" y2="14"/></svg>',
  'Кожзам':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z"/><line x1="5" y1="7" x2="11" y2="7"/><line x1="5" y1="10" x2="9" y2="10"/></svg>',
  'Кожа':          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4z"/><line x1="5.5" y1="6" x2="10.5" y2="6"/><line x1="5.5" y1="9" x2="10.5" y2="9"/><line x1="5.5" y1="12" x2="8.5" y2="12"/></svg>',
  'ПВХ':           '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 6h10v6H3z"/><path d="M5 6V4h6v2"/><line x1="3" y1="9" x2="13" y2="9"/></svg>',
  'Акрил':         '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><polygon points="8,1 15,13 1,13"/><polygon points="8,5 12,12 4,12"/></svg>',
  'Нейлон':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 5 Q5 3 8 5 Q11 7 14 5" stroke-linecap="round"/><path d="M2 8.5 Q5 6.5 8 8.5 Q11 10.5 14 8.5" stroke-linecap="round"/><path d="M2 12 Q5 10 8 12 Q11 14 14 12" stroke-linecap="round"/></svg>',
  'Стекло':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M5 2h6l-1 9a2 2 0 0 1-4 0L5 2z"/><line x1="5" y1="2" x2="11" y2="2"/><path d="M7 5 Q8 4.5 9 5"/></svg>',
  'Полиэстер':     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r=".75" fill="currentColor" stroke="none"/></svg>',
};

const COLOR_HEX = {
  'Чёрный':     '#1a1a1a',
  'Белый':      '#f0f0f0',
  'Серебро':    '#b8b8c8',
  'Золото':     '#d4a843',
  'Синий':      '#2563eb',
  'Зелёный':    '#16a34a',
  'Красный':    '#dc2626',
  'Оранжевый':  '#ea580c',
  'Коричневый': '#78350f',
  'Прозрачный': null,
  'Серый':      '#6b7280',
};

function getFilterIcon(key, val) {
  if (key === 'color') {
    const hex = COLOR_HEX[val];
    if (hex === null) {
      return '<span class="filter-color-dot" style="background:repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/6px 6px;border:1px solid #ccc"></span>';
    }
    const border = val === 'Белый' ? 'border:1px solid #d1d5db;' : '';
    return `<span class="filter-color-dot" style="background:${hex};${border}"></span>`;
  }
  return FILTER_ICONS[val] ? `<span class="filter-icon">${FILTER_ICONS[val]}</span>` : '';
}

// ======== CART STATE ========
let cart = JSON.parse(localStorage.getItem('cart') || '[]');

function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }

function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }
function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

function addToCart(article) {
  const p = allProducts.find(p => p.article === article);
  if (!p) return;
  const existing = cart.find(i => i.article === article);
  if (existing) {
    existing.qty = Math.min(existing.qty + 1, p.qty);
  } else {
    cart.push({ article: p.article, name: p.name, price: p.price, image: p.image, maxQty: p.qty, qty: 1 });
  }
  saveCart();
  updateCartBadge();
  renderCartItems();
  flashAddBtn(article);
}

function removeFromCart(article) {
  cart = cart.filter(i => i.article !== article);
  saveCart();
  updateCartBadge();
  renderCartItems();
}

function setQty(article, qty) {
  const item = cart.find(i => i.article === article);
  if (!item) return;
  qty = Math.max(1, Math.min(qty, item.maxQty || 9999));
  item.qty = qty;
  saveCart();
  updateCartBadge();
  renderCartItems();
}

function updateCartBadge() {
  const n = cartCount();
  const badge = document.getElementById('cart-badge');
  badge.textContent = n;
  badge.classList.toggle('visible', n > 0);
}

function flashAddBtn(article) {
  const btn = document.querySelector(`.add-to-cart-btn[data-article="${article}"]`);
  if (!btn) return;
  btn.classList.add('added');
  btn.textContent = '✓ Добавлено';
  setTimeout(() => { btn.classList.remove('added'); btn.textContent = 'В корзину'; }, 1200);
}

// ======== CART DRAWER ========
const cartOverlay = document.getElementById('cart-overlay');
const cartDrawer  = document.getElementById('cart-drawer');
const cartFooter  = document.getElementById('cart-footer');
const orderSuccess = document.getElementById('order-success');
const checkoutForm = document.getElementById('checkout-form');

function openCart() {
  cartOverlay.classList.add('open');
  cartDrawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  orderSuccess.style.display = 'none';
  checkoutForm.style.display = '';
}
function closeCart() {
  cartOverlay.classList.remove('open');
  cartDrawer.classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('cart-btn').addEventListener('click', openCart);
document.getElementById('cart-close').addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);
document.getElementById('order-new-btn').addEventListener('click', () => {
  cart = []; saveCart(); updateCartBadge(); renderCartItems(); closeCart();
});

function renderCartItems() {
  const container = document.getElementById('cart-items');
  const totalEl   = document.getElementById('cart-total-val');

  if (!cart.length) {
    container.innerHTML = '<p class="cart-empty">Корзина пуста</p>';
    cartFooter.style.display = 'none';
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item" data-article="${escAttr(item.article)}">
      <img class="cart-item-img" src="${escAttr(item.image)}" alt="" onerror="this.style.display='none'">
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(item.name)}</div>
        <div class="cart-item-art">Арт. ${item.article}</div>
        <div class="cart-item-price">${item.price} ₽ / шт.</div>
        <div class="cart-qty-row">
          <button class="qty-btn" data-action="dec" data-article="${escAttr(item.article)}">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-article="${escAttr(item.article)}">+</button>
          <span style="margin-left:auto;font-weight:700;color:var(--primary)">${item.qty * item.price} ₽</span>
        </div>
      </div>
      <button class="cart-remove" data-article="${escAttr(item.article)}" title="Удалить">✕</button>
    </div>`).join('');

  container.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const art = btn.dataset.article;
      const item = cart.find(i => i.article === art);
      if (!item) return;
      setQty(art, item.qty + (btn.dataset.action === 'inc' ? 1 : -1));
    });
  });
  container.querySelectorAll('.cart-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.article));
  });

  totalEl.textContent = cartTotal() + ' ₽';
  cartFooter.style.display = '';
}

// ======== ORDER ========
document.getElementById('order-btn').addEventListener('click', async () => {
  const name    = document.getElementById('co-name').value.trim();
  const phone   = document.getElementById('co-phone').value.trim();
  const comment = document.getElementById('co-comment').value.trim();

  if (!name || !phone) {
    document.getElementById('co-name').reportValidity();
    document.getElementById('co-phone').reportValidity();
    return;
  }
  if (!cart.length) return;

  const btn = document.getElementById('order-btn');
  btn.disabled = true;
  btn.textContent = 'Отправляем…';

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name, phone, comment },
        items: cart.map(i => ({ article: i.article, name: i.name, price: i.price, qty: i.qty }))
      })
    });
    const data = await res.json();
    if (res.ok) {
      checkoutForm.style.display = 'none';
      orderSuccess.style.display = 'block';
      document.getElementById('order-success-text').textContent =
        `Заказ #${data.orderId} принят. Мы свяжемся с вами в ближайшее время.`;
    } else {
      alert(data.error || 'Ошибка при оформлении заказа');
      btn.disabled = false;
      btn.textContent = 'Оформить заказ';
    }
  } catch {
    alert('Ошибка сети. Попробуйте ещё раз.');
    btn.disabled = false;
    btn.textContent = 'Оформить заказ';
  }
});

// ======== FILTERS ========
function buildFilters() {
  const groups = { category: {}, material: {}, color: {} };
  for (const p of allProducts) {
    for (const key of ['category', 'material', 'color']) {
      const val = p[key];
      if (!val) continue;
      groups[key][val] = (groups[key][val] || 0) + 1;
    }
  }

  const GROUP_LIMIT = 6;

  document.querySelectorAll('.filter-group').forEach(group => {
    const key = group.dataset.key;
    const counts = groups[key];
    const container = group.querySelector('.filter-options');
    const sorted = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], 'ru'));

    const makeOption = ([val, cnt], hidden) => `
      <label class="filter-option${hidden ? ' filter-extra' : ''}"${hidden ? ' style="display:none"' : ''}>
        <input type="checkbox" data-key="${escAttr(key)}" data-value="${escAttr(val)}">
        ${getFilterIcon(key, val)}
        <span class="filter-option-name">${escHtml(val)}</span>
        <span class="filter-option-count">${cnt}</span>
      </label>`;

    const useLimit = sorted.length > GROUP_LIMIT;
    const visible  = useLimit ? sorted.slice(0, GROUP_LIMIT) : sorted;
    const extra    = useLimit ? sorted.slice(GROUP_LIMIT) : [];

    container.innerHTML =
      visible.map(e => makeOption(e, false)).join('') +
      extra.map(e => makeOption(e, true)).join('') +
      (useLimit ? `<button class="filter-show-more" data-expanded="0">Показать ещё (${extra.length})</button>` : '');

    if (useLimit) {
      container.querySelector('.filter-show-more').addEventListener('click', function () {
        const expanded = this.dataset.expanded === '1';
        container.querySelectorAll('.filter-extra').forEach(el => {
          el.style.display = expanded ? 'none' : '';
        });
        this.dataset.expanded = expanded ? '0' : '1';
        this.textContent = expanded ? `Показать ещё (${extra.length})` : 'Скрыть';
      });
    }
  });

  document.querySelectorAll('.filter-options input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const { key, value } = cb.dataset;
      if (cb.checked) selected[key].add(value);
      else selected[key].delete(value);
      applyFilters();
    });
  });
}

function applyFilters() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  let result = allProducts.filter(p => {
    if (q && !p.name.toLowerCase().includes(q) && !p.article.includes(q)) return false;
    for (const key of ['category', 'material', 'color']) {
      if (selected[key].size && !selected[key].has(p[key])) return false;
    }
    return true;
  });
  if (sortState.field) {
    const f = sortState.field;
    const dir = sortState.dir === 'asc' ? 1 : -1;
    result = result.slice().sort((a, b) => (a[f] - b[f]) * dir);
  }
  renderProducts(result);
}

// ======== DATA LOADING ========
async function loadData() {
  const [prodRes, contRes] = await Promise.all([fetch('/api/products'), fetch('/api/contacts')]);
  allProducts = await prodRes.json();
  contacts    = await contRes.json();
  renderContacts();
  buildFilters();
  applyFilters();
  updateCartBadge();
  renderCartItems();
}

function renderContacts() {
  const c = contacts;
  const heroTitle = document.getElementById('hero-title');
  const heroText  = document.getElementById('hero-text');
  if (heroTitle) heroTitle.textContent = c.hero_title || heroTitle.textContent;
  if (heroText)  heroText.textContent  = c.hero_text  || heroText.textContent;
  const phone = c.phone || '';
  document.getElementById('header-phone').href = 'tel:' + phone.replace(/\D/g, '');
  document.getElementById('link-max').href = c.max || '#';
  document.getElementById('link-tg').href  = c.telegram || '#';
  document.getElementById('link-vk').href  = c.vk || '#';
  document.getElementById('ct-phone').href = 'tel:' + phone.replace(/\D/g, '');
  document.getElementById('ct-phone-v').textContent = phone || '—';
  document.getElementById('ct-email').href = 'mailto:' + (c.email || '');
  document.getElementById('ct-email-v').textContent = c.email || '—';
  document.getElementById('ct-max').href = c.max || '#';
  document.getElementById('ct-tg').href  = c.telegram || '#';
  document.getElementById('ct-vk').href  = c.vk || '#';
}

function renderProducts(list) {
  const grid  = document.getElementById('products-grid');
  const empty = document.getElementById('empty-msg');
  if (!list.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  grid.innerHTML = list.map(p => {
    const inStock = p.qty > 0;
    const qtyLabel = inStock
      ? `<span class="card-qty in-stock">В наличии: ${p.qty} шт.</span>`
      : `<span class="card-qty out-stock">Нет в наличии</span>`;
    const videoBtn = p.video
      ? `<a href="#" class="card-video-btn" data-video="${escAttr(p.video)}">&#9654; Видео</a>` : '';
    return `
      <div class="product-card">
        <a href="/product/${escAttr(p.article)}" class="card-img-link" tabindex="-1" aria-hidden="true">
          <div class="card-img-wrap">
            <img src="${escAttr(p.image)}" alt="${escHtml(p.name)}" loading="lazy"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eee%22/></svg>'">
          </div>
        </a>
        <div class="card-body">
          <span class="card-article">Арт. ${p.article}</span>
          <a href="/product/${escAttr(p.article)}" class="card-name">${escHtml(p.name)}</a>
          <div class="card-prices">
            <span class="price-line price-retail"><span class="price-tag">Розница</span><span class="price-val">${fmtPrice(retailPrice(p.price))}</span></span>
            <span class="price-line price-opt"><span class="price-tag">Опт</span><span class="price-val">${fmtPrice(p.price)}</span></span>
          </div>
          ${qtyLabel}
          ${videoBtn}
          ${inStock ? `<button class="add-to-cart-btn" data-article="${escAttr(p.article)}">В корзину</button>` : ''}
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => addToCart(btn.dataset.article));
  });
  grid.querySelectorAll('[data-video]').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); openVideoModal(btn.dataset.video); });
  });
}

// ======== SEARCH ========
document.getElementById('search-form').addEventListener('submit', e => { e.preventDefault(); applyFilters(); });
document.getElementById('search-input').addEventListener('input', applyFilters);

// ======== FILTER CONTROLS ========
document.getElementById('filter-reset').addEventListener('click', () => {
  for (const key of ['category', 'material', 'color']) selected[key].clear();
  document.querySelectorAll('.filter-options input[type=checkbox]').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.filter-extra').forEach(el => { el.style.display = 'none'; });
  document.querySelectorAll('.filter-show-more').forEach(btn => {
    btn.dataset.expanded = '0';
    const n = btn.closest('.filter-options').querySelectorAll('.filter-extra').length;
    btn.textContent = `Показать ещё (${n})`;
  });
  applyFilters();
});

document.getElementById('filter-toggle').addEventListener('click', () => {
  const sidebar = document.getElementById('filter-sidebar');
  const btn = document.getElementById('filter-toggle');
  const open = sidebar.classList.toggle('open');
  btn.textContent = open ? 'Фильтры ✕' : 'Фильтры ▾';
});

// ======== SORT ========
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const field = btn.dataset.field;
    if (sortState.field === field) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.field = field;
      sortState.dir = 'asc';
    }
    document.querySelectorAll('.sort-btn').forEach(b => {
      const isActive = b.dataset.field === sortState.field;
      b.classList.toggle('active', isActive);
      b.querySelector('.sort-arrow').textContent = isActive
        ? (sortState.dir === 'asc' ? ' ↑' : ' ↓') : '';
    });
    applyFilters();
  });
});

// ======== VIDEO MODAL ========
const modal      = document.getElementById('video-modal');
const modalVideo = document.getElementById('modal-video');
function openVideoModal(src) { modalVideo.src = src; modal.classList.add('open'); modalVideo.play().catch(()=>{}); }
function closeVideoModal()   { modal.classList.remove('open'); modalVideo.pause(); modalVideo.src = ''; }
document.getElementById('modal-close').addEventListener('click', closeVideoModal);
modal.addEventListener('click', e => { if (e.target === modal) closeVideoModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeVideoModal(); closeCart(); } });

// ======== UTILS ========
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return escHtml(s); }

// ======== INIT ========
loadData().catch(() => {
  document.getElementById('empty-msg').textContent = 'Не удалось загрузить товары.';
  document.getElementById('empty-msg').style.display = 'block';
});
