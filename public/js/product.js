'use strict';

const product = window.PRODUCT_DATA;

// ======== CART ========
let cart = JSON.parse(localStorage.getItem('cart') || '[]');

function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }
function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }
function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return escHtml(s); }

// ======== PHONE MASK: +7XXXXXXXXXX ========
// Применяется ко всем полям типа tel на странице: телефон в корзине и
// контакт в форме «Запросить оптовые условия».
function formatPhoneMask(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  return '+' + digits.slice(0, 11);
}
function isValidPhone(v) { return /^\+7\d{10}$/.test(v); }
function bindPhoneMask(input) {
  if (!input) return;
  input.addEventListener('focus', () => { if (!input.value) input.value = '+7'; });
  input.addEventListener('input', () => { input.value = formatPhoneMask(input.value); });
  input.addEventListener('keydown', e => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && input.selectionStart <= 2 && input.selectionEnd <= 2) {
      e.preventDefault();
    }
  });
}
document.querySelectorAll('input[type="tel"]').forEach(bindPhoneMask);

function updateCartBadge() {
  const n = cartCount();
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  badge.textContent = n;
  badge.classList.toggle('visible', n > 0);
}

// ======== CART DRAWER ========
const cartOverlay  = document.getElementById('cart-overlay');
const cartDrawer   = document.getElementById('cart-drawer');
const cartFooter   = document.getElementById('cart-footer');
const orderSuccess = document.getElementById('order-success');
const checkoutForm = document.getElementById('checkout-form');

function openCart() {
  cartOverlay.classList.add('open');
  cartDrawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  orderSuccess.style.display = 'none';
  checkoutForm.style.display = '';
  renderCartItems();
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

function setQty(article, qty) {
  const item = cart.find(i => i.article === article);
  if (!item) return;
  item.qty = Math.max(1, Math.min(qty, item.maxQty || 9999));
  saveCart(); updateCartBadge(); renderCartItems();
}

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
      const art  = btn.dataset.article;
      const item = cart.find(i => i.article === art);
      if (!item) return;
      setQty(art, item.qty + (btn.dataset.action === 'inc' ? 1 : -1));
    });
  });
  container.querySelectorAll('.cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      cart = cart.filter(i => i.article !== btn.dataset.article);
      saveCart(); updateCartBadge(); renderCartItems();
    });
  });

  totalEl.textContent = cartTotal() + ' ₽';
  cartFooter.style.display = '';
}

// ======== ADD TO CART ========
function addToCart() {
  const existing = cart.find(i => i.article === product.article);
  if (existing) {
    existing.qty = Math.min(existing.qty + 1, product.qty);
  } else {
    cart.push({
      article: product.article, name: product.name,
      price:   product.price,   image: product.image,
      maxQty:  product.qty,     qty: 1,
    });
  }
  saveCart();
  updateCartBadge();
  window.skladTrack?.('add_to_cart', { item_id: product?.article, item_name: product?.name, value: product?.price, currency: 'RUB' });
  const btn = document.getElementById('add-btn');
  if (btn) {
    btn.classList.add('added');
    btn.textContent = '✓ Добавлено';
    setTimeout(() => { btn.classList.remove('added'); btn.textContent = 'В корзину'; }, 1200);
  }
  openCart();
}

const addBtn = document.getElementById('add-btn');
if (addBtn) addBtn.addEventListener('click', addToCart);

if (product) window.skladTrack?.('view_item', { item_id: product.article, item_name: product.name, value: product.price, currency: 'RUB' });

// ======== ORDER ========
document.getElementById('order-btn').addEventListener('click', async () => {
  const name    = document.getElementById('co-name').value.trim();
  const phone   = document.getElementById('co-phone').value.trim();
  const comment = document.getElementById('co-comment').value.trim();
  if (!name || !phone || !cart.length) return;
  if (!isValidPhone(phone)) { document.getElementById('co-phone').reportValidity(); return; }
  const btn = document.getElementById('order-btn');
  btn.disabled = true; btn.textContent = 'Отправляем…';
  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { name, phone, comment },
        items: cart.map(i => ({ article: i.article, name: i.name, price: i.price, qty: i.qty })),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      checkoutForm.style.display = 'none';
      orderSuccess.style.display = 'block';
      window.skladTrack?.('generate_lead', { lead_type: 'order', value: cartTotal(), currency: 'RUB' });
      document.getElementById('order-success-text').textContent =
        `Заказ #${data.orderId} принят. Мы свяжемся с вами в ближайшее время.`;
    } else {
      alert(data.error || 'Ошибка при оформлении заказа');
      btn.disabled = false; btn.textContent = 'Оформить заказ';
    }
  } catch {
    alert('Ошибка сети. Попробуйте ещё раз.');
    btn.disabled = false; btn.textContent = 'Оформить заказ';
  }
});

// ======== VIDEO MODAL ========
const modal      = document.getElementById('video-modal');
const modalVideo = document.getElementById('modal-video');
const videoBtn   = document.getElementById('video-btn');

if (videoBtn) {
  videoBtn.addEventListener('click', () => {
    modalVideo.src = videoBtn.dataset.video;
    modal.classList.add('open');
    modalVideo.play().catch(() => {});
  });
}
function closeVideoModal() {
  modal.classList.remove('open');
  modalVideo.pause();
  modalVideo.src = '';
}
document.getElementById('modal-close').addEventListener('click', closeVideoModal);
modal.addEventListener('click', e => { if (e.target === modal) closeVideoModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeCart(); closeVideoModal(); }
});

// ======== INIT ========
updateCartBadge();
renderCartItems();
