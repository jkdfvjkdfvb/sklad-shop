'use strict';

// Общая логика корзины для сервисных SEO-страниц (нанесение логотипа, тиснение и т.п.),
// на которых нет собственного грида товаров — только шапка с кнопкой корзины.

let cart = JSON.parse(localStorage.getItem('cart') || '[]');

function saveCart() { localStorage.setItem('cart', JSON.stringify(cart)); }
function cartCount() { return cart.reduce((s, i) => s + i.qty, 0); }
function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return escHtml(s); }

function updateCartBadge() {
  const n = cartCount();
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  badge.textContent = n;
  badge.classList.toggle('visible', n > 0);
}

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

document.getElementById('order-btn').addEventListener('click', async () => {
  const name    = document.getElementById('co-name').value.trim();
  const phone   = document.getElementById('co-phone').value.trim();
  const comment = document.getElementById('co-comment').value.trim();
  if (!name || !phone || !cart.length) return;
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

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

updateCartBadge();
renderCartItems();
