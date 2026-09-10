'use strict';

// ======== ХЕДЕР ПРИ СКРОЛЛЕ ========
try {
  (function initCompactHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y > 80 && y > lastY) header.classList.add('is-compact');
      else if (y <= 80 || y < lastY) header.classList.remove('is-compact');
      lastY = y;
    }, { passive: true });
  })();
} catch {}

// ======== КОРЗИНА (LOCALSTORAGE + DRAWER) ========
let cart = [];
try {
  cart = JSON.parse(localStorage.getItem('cart') || '[]');
} catch {
  cart = [];
}

function saveCart() {
  try {
    localStorage.setItem('cart', JSON.stringify(cart));
  } catch {}
}

function cartCount() {
  return cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
}

function cartTotal() {
  return cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = cartCount();
  badge.textContent = count;
  badge.classList.toggle('visible', count > 0);
}

function escH(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const cartOverlay = document.getElementById('cart-overlay');
const cartDrawer = document.getElementById('cart-drawer');
const cartFooter = document.getElementById('cart-footer');
const cartItemsContainer = document.getElementById('cart-items');
const checkoutForm = document.getElementById('checkout-form');
const orderSuccess = document.getElementById('order-success');

function openCart() {
  if (!cartOverlay || !cartDrawer) return;
  cartOverlay.classList.add('open');
  cartDrawer.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (orderSuccess) orderSuccess.style.display = 'none';
  if (checkoutForm) checkoutForm.style.display = '';
  renderCartItems();
}

function closeCart() {
  if (!cartOverlay || !cartDrawer) return;
  cartOverlay.classList.remove('open');
  cartDrawer.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCartItems() {
  if (!cartItemsContainer || !cartFooter) return;
  const totalEl = document.getElementById('cart-total-val');

  if (!cart.length) {
    cartItemsContainer.innerHTML = '<p class="cart-empty">Корзина пуста</p>';
    cartFooter.style.display = 'none';
    return;
  }

  cartItemsContainer.innerHTML = cart.map(item => `
    <div class="cart-item" data-article="${escH(item.article)}">
      <img class="cart-item-img" src="${escH(item.image)}" alt="" onerror="this.style.display='none'">
      <div class="cart-item-info">
        <div class="cart-item-name">${escH(item.name)}</div>
        <div class="cart-item-art">Арт. ${escH(item.article)}</div>
        <div class="cart-item-price">${Number(item.price).toLocaleString('ru-RU')} ₽ / шт.</div>
        <div class="cart-qty-row">
          <button type="button" class="qty-btn" data-action="dec" data-article="${escH(item.article)}">−</button>
          <span class="qty-val">${item.qty}</span>
          <button type="button" class="qty-btn" data-action="inc" data-article="${escH(item.article)}">+</button>
          <span style="margin-left:auto;font-weight:700;color:var(--ink)">${(item.qty * item.price).toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>
      <button type="button" class="cart-remove" data-article="${escH(item.article)}" title="Удалить">✕</button>
    </div>
  `).join('');

  cartItemsContainer.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const art = btn.dataset.article;
      const target = cart.find(i => String(i.article) === String(art));
      if (!target) return;
      if (btn.dataset.action === 'inc') {
        target.qty = Math.min(target.qty + 1, target.maxQty || 9999);
      } else {
        target.qty = Math.max(1, target.qty - 1);
      }
      saveCart();
      updateCartBadge();
      renderCartItems();
    });
  });

  cartItemsContainer.querySelectorAll('.cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const art = btn.dataset.article;
      cart = cart.filter(i => String(i.article) !== String(art));
      saveCart();
      updateCartBadge();
      renderCartItems();
    });
  });

  if (totalEl) {
    totalEl.textContent = cartTotal().toLocaleString('ru-RU') + ' ₽';
  }
  cartFooter.style.display = '';
}

document.getElementById('cart-btn')?.addEventListener('click', openCart);
document.getElementById('cart-close')?.addEventListener('click', closeCart);
cartOverlay?.addEventListener('click', closeCart);
document.getElementById('order-new-btn')?.addEventListener('click', () => {
  cart = [];
  saveCart();
  updateCartBadge();
  renderCartItems();
  closeCart();
});

// Маска телефона для оформления заказа
function formatPhoneMask(raw) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  return '+' + digits.slice(0, 11);
}
function isValidPhone(v) {
  return /^\+7\d{10}$/.test(v);
}
document.querySelectorAll('input[type="tel"]').forEach(input => {
  input.addEventListener('focus', () => { if (!input.value) input.value = '+7'; });
  input.addEventListener('input', () => { input.value = formatPhoneMask(input.value); });
  input.addEventListener('keydown', e => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && input.selectionStart <= 2 && input.selectionEnd <= 2) {
      e.preventDefault();
    }
  });
});

// Оформление заказа
document.getElementById('order-btn')?.addEventListener('click', async () => {
  const nameInput = document.getElementById('co-name');
  const phoneInput = document.getElementById('co-phone');
  const commentInput = document.getElementById('co-comment');
  if (!nameInput || !phoneInput) return;

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const comment = commentInput ? commentInput.value.trim() : '';

  if (!name) {
    nameInput.focus();
    return;
  }
  if (!isValidPhone(phone)) {
    phoneInput.reportValidity();
    phoneInput.focus();
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
        items: cart.map(i => ({ article: i.article, name: i.name, price: i.price, qty: i.qty })),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      if (checkoutForm) checkoutForm.style.display = 'none';
      if (orderSuccess) orderSuccess.style.display = 'block';
      const successText = document.getElementById('order-success-text');
      if (successText) {
        successText.textContent = `Заказ #${data.orderId || ''} принят. Менеджер свяжется с вами в течение 15 минут.`;
      }
    } else {
      alert(data.error || 'Ошибка при оформлении заказа');
      btn.disabled = false;
      btn.textContent = 'Оформить заказ';
    }
  } catch {
    alert('Ошибка сети. Пожалуйста, попробуйте еще раз.');
    btn.disabled = false;
    btn.textContent = 'Оформить заказ';
  }
});

// ======== ЛИПКАЯ ПАНЕЛЬ ПИЛЮЛЬ И НАВИГАЦИЯ ========
const navPills = Array.from(document.querySelectorAll('.delivery-nav-pill'));
const contentBlocks = Array.from(document.querySelectorAll('.delivery-summary-section, .delivery-content-block, .logistics-contact-strip'));

navPills.forEach(pill => {
  pill.addEventListener('click', e => {
    const targetId = pill.dataset.target;
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      e.preventDefault();
      targetEl.scrollIntoView({ behavior: 'smooth' });
      navPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    }
  });
});

// Scroll Spy: отслеживание активного раздела при скролле
if ('IntersectionObserver' in window && contentBlocks.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        if (id) {
          navPills.forEach(p => p.classList.remove('active'));
          const currentPill = navPills.find(p => p.dataset.target === id);
          if (currentPill) {
            currentPill.classList.add('active');
            currentPill.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
          }
        }
      }
    });
  }, { threshold: 0.15, rootMargin: '-100px 0px -40% 0px' });

  contentBlocks.forEach(block => observer.observe(block));
}

// ======== КОПИРОВАНИЕ РЕКВИЗИТОВ ========
const requisitesCopyBtn = document.getElementById('requisites-copy-btn');
if (requisitesCopyBtn) {
  requisitesCopyBtn.addEventListener('click', async () => {
    const text = requisitesCopyBtn.dataset.text || '';
    const oldLabel = requisitesCopyBtn.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      document.body.removeChild(helper);
    }
    requisitesCopyBtn.textContent = '✓ Скопировано';
    requisitesCopyBtn.classList.add('copied');
    setTimeout(() => {
      requisitesCopyBtn.textContent = oldLabel;
      requisitesCopyBtn.classList.remove('copied');
    }, 1500);
  });
}

// Первоначальное обновление бейджа корзины
updateCartBadge();
