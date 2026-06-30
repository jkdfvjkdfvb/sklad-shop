'use strict';

let allProducts = [];
let contacts = {};

// ======== FILTER STATE ========
const selected = { category: new Set(), material: new Set(), color: new Set() };

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

  // qty buttons
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

  document.querySelectorAll('.filter-group').forEach(group => {
    const key = group.dataset.key;
    const counts = groups[key];
    const container = group.querySelector('.filter-options');
    const sorted = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0], 'ru'));
    container.innerHTML = sorted.map(([val, cnt]) => `
      <label class="filter-option">
        <input type="checkbox" data-key="${escAttr(key)}" data-value="${escAttr(val)}">
        <span class="filter-option-name">${escHtml(val)}</span>
        <span class="filter-option-count">${cnt}</span>
      </label>`).join('');
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
  const result = allProducts.filter(p => {
    if (q && !p.name.toLowerCase().includes(q) && !p.article.includes(q)) return false;
    for (const key of ['category', 'material', 'color']) {
      if (selected[key].size && !selected[key].has(p[key])) return false;
    }
    return true;
  });
  renderProducts(result);
}

// ======== DATA LOADING ========
async function loadData() {
  const [prodRes, contRes] = await Promise.all([fetch('/api/products'), fetch('/api/contacts')]);
  allProducts = await prodRes.json();
  contacts    = await contRes.json();
  renderContacts();
  buildFilters();
  renderProducts(allProducts);
  updateCartBadge();
  renderCartItems();
}

function renderContacts() {
  const c = contacts;
  const phone = c.phone || '';
  document.getElementById('header-phone').textContent = phone;
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
      ? `<a href="#" class="card-video-btn" data-video="${escAttr(p.video)}">▶ Видео</a>` : '';
    return `
      <div class="product-card">
        <div class="card-img-wrap">
          <img src="${escAttr(p.image)}" alt="${escHtml(p.name)}" loading="lazy"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eee%22/></svg>'">
        </div>
        <div class="card-body">
          <span class="card-article">Арт. ${p.article}</span>
          <span class="card-name">${escHtml(p.name)}</span>
          <span class="card-price">${p.price} ₽</span>
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
  applyFilters();
});

document.getElementById('filter-toggle').addEventListener('click', () => {
  const sidebar = document.getElementById('filter-sidebar');
  const btn = document.getElementById('filter-toggle');
  const open = sidebar.classList.toggle('open');
  btn.textContent = open ? 'Фильтры ✕' : 'Фильтры ▾';
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
