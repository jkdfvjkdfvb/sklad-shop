'use strict';

let allProducts = [];
let contacts = {};

async function loadData() {
  const [prodRes, contRes] = await Promise.all([
    fetch('/api/products'),
    fetch('/api/contacts')
  ]);
  allProducts = await prodRes.json();
  contacts = await contRes.json();
  renderContacts();
  renderProducts(allProducts);
}

function renderContacts() {
  const c = contacts;
  document.getElementById('header-phone').textContent = c.phone || '';
  document.getElementById('header-phone').href = 'tel:' + (c.phone || '').replace(/\D/g, '');
  document.getElementById('link-max').href = c.max || '#';
  document.getElementById('link-tg').href = c.telegram || '#';
  document.getElementById('link-vk').href = c.vk || '#';

  document.getElementById('ct-phone').href = 'tel:' + (c.phone || '').replace(/\D/g, '');
  document.getElementById('ct-phone-v').textContent = c.phone || '—';
  document.getElementById('ct-email').href = 'mailto:' + (c.email || '');
  document.getElementById('ct-email-v').textContent = c.email || '—';
  document.getElementById('ct-max').href = c.max || '#';
  document.getElementById('ct-tg').href = c.telegram || '#';
  document.getElementById('ct-vk').href = c.vk || '#';
}

function renderProducts(list) {
  const grid = document.getElementById('products-grid');
  const empty = document.getElementById('empty-msg');
  if (!list.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = list.map(p => {
    const inStock = p.qty > 0;
    const qtyLabel = inStock
      ? `<span class="card-qty in-stock">В наличии: ${p.qty} шт.</span>`
      : `<span class="card-qty out-stock">Нет в наличии</span>`;
    const videoBtn = p.video
      ? `<a href="#" class="card-video-btn" data-video="${p.video}">▶ Видео</a>`
      : '';
    return `
      <div class="product-card">
        <div class="card-img-wrap">
          <img src="${p.image}" alt="${escHtml(p.name)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23eee%22/></svg>'">
        </div>
        <div class="card-body">
          <span class="card-article">Арт. ${p.article}</span>
          <span class="card-name">${escHtml(p.name)}</span>
          <span class="card-price">${p.price} ₽</span>
          ${qtyLabel}
          ${videoBtn}
        </div>
      </div>`;
  }).join('');

  // Video modal triggers
  grid.querySelectorAll('[data-video]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      openVideoModal(btn.dataset.video);
    });
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Search
document.getElementById('search-form').addEventListener('submit', e => {
  e.preventDefault();
  filterProducts();
});
document.getElementById('search-input').addEventListener('input', filterProducts);

function filterProducts() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  if (!q) { renderProducts(allProducts); return; }
  renderProducts(allProducts.filter(p =>
    p.name.toLowerCase().includes(q) || p.article.includes(q)
  ));
}

// Video modal
const modal = document.getElementById('video-modal');
const modalVideo = document.getElementById('modal-video');

function openVideoModal(src) {
  modalVideo.src = src;
  modal.classList.add('open');
  modalVideo.play().catch(() => {});
}

function closeVideoModal() {
  modal.classList.remove('open');
  modalVideo.pause();
  modalVideo.src = '';
}

document.getElementById('modal-close').addEventListener('click', closeVideoModal);
modal.addEventListener('click', e => { if (e.target === modal) closeVideoModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVideoModal(); });

// Init
loadData().catch(() => {
  document.getElementById('empty-msg').textContent = 'Не удалось загрузить товары. Проверьте соединение.';
  document.getElementById('empty-msg').style.display = 'block';
});
