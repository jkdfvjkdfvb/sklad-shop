'use strict';

let token = sessionStorage.getItem('adminToken') || '';
let allProducts = [];
let allOrders = [];

const STATUS_LABELS = { new: 'Новый', processing: 'В работе', done: 'Выполнен' };

// ======== AUTH ========
async function login() {
  const pwd = document.getElementById('login-pwd').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    if (!res.ok) { errEl.textContent = 'Неверный пароль'; errEl.style.display = 'block'; return; }
    token = (await res.json()).token;
    sessionStorage.setItem('adminToken', token);
    showAdmin();
  } catch { errEl.textContent = 'Ошибка сети'; errEl.style.display = 'block'; }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST', headers: { 'x-admin-token': token } }).catch(() => {});
  token = ''; sessionStorage.removeItem('adminToken');
  document.getElementById('login-section').style.display = '';
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('login-pwd').value = '';
}

document.getElementById('login-form').addEventListener('submit', e => { e.preventDefault(); login(); });
document.getElementById('logout-btn').addEventListener('click', logout);

async function showAdmin() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('admin-section').style.display = '';
  await Promise.all([loadOrders(), loadProducts(), loadContacts()]);
}

if (token) {
  fetch('/api/admin/products', { headers: { 'x-admin-token': token } })
    .then(r => r.ok ? showAdmin() : (token = '', sessionStorage.removeItem('adminToken')))
    .catch(() => {});
}

// ======== TABS ========
document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ======== ORDERS ========
async function loadOrders() {
  const res = await apiFetch('/api/admin/orders');
  allOrders = await res.json();
  renderOrders();
  updateOrdersBadge();
}

function updateOrdersBadge() {
  const newCount = allOrders.filter(o => o.status === 'new').length;
  const badge = document.getElementById('orders-badge');
  badge.textContent = newCount;
  badge.style.display = newCount > 0 ? 'inline' : 'none';
}

function renderOrders() {
  const tbody = document.getElementById('orders-tbody');
  if (!allOrders.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#6b7280">Заказов пока нет</td></tr>';
    return;
  }
  tbody.innerHTML = allOrders.map(o => {
    const date = new Date(o.date).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    const preview = o.items.slice(0,2).map(i => `${i.name} ×${i.qty}`).join(', ') + (o.items.length > 2 ? ` +${o.items.length - 2}` : '');
    return `<tr style="cursor:pointer" data-order-id="${escAttr(o.id)}">
      <td><b>#${escHtml(o.id)}</b></td>
      <td style="white-space:nowrap;font-size:.8rem">${date}</td>
      <td>${escHtml(o.customer.name)}</td>
      <td><a href="tel:${o.customer.phone.replace(/\D/g,'')}">${escHtml(o.customer.phone)}</a></td>
      <td class="order-items-preview">${escHtml(preview)}</td>
      <td style="white-space:nowrap;font-weight:700">${o.total} ₽</td>
      <td>
        <select class="status-select" data-order-id="${escAttr(o.id)}" onclick="event.stopPropagation()">
          ${['new','processing','done'].map(s =>
            `<option value="${s}" ${o.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`
          ).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-order-id]').forEach(row => {
    row.addEventListener('click', () => openOrderDetail(row.dataset.orderId));
  });
  tbody.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', () => updateOrderStatus(sel.dataset.orderId, sel.value));
  });
}

async function updateOrderStatus(id, status) {
  await apiFetch(`/api/admin/orders/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  const o = allOrders.find(o => o.id === id);
  if (o) o.status = status;
  updateOrdersBadge();
}

function openOrderDetail(id) {
  const o = allOrders.find(o => o.id === id);
  if (!o) return;
  const date = new Date(o.date).toLocaleString('ru-RU');
  const itemsHtml = o.items.map(i => `
    <tr>
      <td>${escHtml(i.article)}</td>
      <td>${escHtml(i.name)}</td>
      <td style="text-align:center">${i.qty}</td>
      <td style="text-align:right">${i.price} ₽</td>
      <td style="text-align:right;font-weight:700">${i.qty * i.price} ₽</td>
    </tr>`).join('');

  document.getElementById('od-title').textContent = `Заказ #${o.id}`;
  document.getElementById('od-body').innerHTML = `
    <div class="od-row"><b>Дата</b>${date}</div>
    <div class="od-row"><b>Покупатель</b>${escHtml(o.customer.name)}</div>
    <div class="od-row"><b>Телефон</b><a href="tel:${o.customer.phone.replace(/\D/g,'')}">${escHtml(o.customer.phone)}</a></div>
    ${o.customer.comment ? `<div class="od-row"><b>Комментарий</b>${escHtml(o.customer.comment)}</div>` : ''}
    <table class="od-items-table">
      <thead><tr><th>Артикул</th><th>Товар</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="od-total">Итого: ${o.total} ₽</div>`;

  document.getElementById('order-detail-overlay').style.display = 'flex';
}

document.getElementById('od-close').addEventListener('click', () => {
  document.getElementById('order-detail-overlay').style.display = 'none';
});
document.getElementById('order-detail-overlay').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

// ======== PRODUCTS ========
async function loadProducts() {
  const res = await apiFetch('/api/admin/products');
  allProducts = await res.json();
  renderTable(allProducts);
}

function renderTable(products) {
  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = products.map(p => productRow(p)).join('');
  attachRowListeners();
}

function productRow(p) {
  const imgEl = p.image
    ? `<img class="thumb" src="${escAttr(p.image)}" alt="" onerror="this.style.display='none'">`
    : `<div class="thumb-placeholder">нет фото</div>`;
  const vidEl = p.video
    ? `<a class="video-link" href="${escAttr(p.video)}" target="_blank">▶ видео</a>`
    : `<span style="color:#9ca3af;font-size:.75rem">нет</span>`;

  return `<tr data-article="${escAttr(p.article)}">
    <td>${escHtml(p.article)}</td>
    <td>${imgEl}</td>
    <td style="max-width:240px">${escHtml(p.name)}</td>
    <td><input class="inline-input field-qty" type="number" min="0" value="${p.qty}"></td>
    <td><input class="inline-input field-price" type="number" min="0" value="${p.price}"></td>
    <td>
      <label class="toggle-switch">
        <input type="checkbox" class="field-visible" ${p.visible ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    </td>
    <td>
      <div class="action-group">
        <label class="upload-label">📷 Фото<input type="file" class="upload-img" accept="image/*"></label>
        <label class="upload-label">🎬 Видео<input type="file" class="upload-vid" accept="video/*"></label>
        <div id="vid-status-${escAttr(p.article)}">${vidEl}</div>
      </div>
    </td>
    <td>
      <div class="save-btn-row">
        <button class="btn btn-primary btn-sm save-row-btn">Сохранить</button>
        <span class="save-status" id="status-${escAttr(p.article)}">✓</span>
      </div>
    </td>
  </tr>`;
}

function attachRowListeners() {
  document.querySelectorAll('#products-tbody tr').forEach(row => {
    const art = row.dataset.article;
    row.querySelector('.save-row-btn').addEventListener('click', () => saveRow(row, art));
    row.querySelector('.upload-img').addEventListener('change', async function () {
      if (!this.files[0]) return;
      const fd = new FormData(); fd.append('image', this.files[0]);
      const res = await apiFetch(`/api/admin/products/${art}/image`, { method: 'POST', body: fd });
      if (res.ok) {
        const d = await res.json();
        const thumb = row.querySelector('.thumb, .thumb-placeholder');
        if (thumb) thumb.outerHTML = `<img class="thumb" src="${d.image}?t=${Date.now()}" alt="">`;
        showStatus(art, true, '✓ фото');
      } else showStatus(art, false, '✗ ошибка');
    });
    row.querySelector('.upload-vid').addEventListener('change', async function () {
      if (!this.files[0]) return;
      const fd = new FormData(); fd.append('video', this.files[0]);
      const res = await apiFetch(`/api/admin/products/${art}/video`, { method: 'POST', body: fd });
      if (res.ok) {
        const d = await res.json();
        document.getElementById(`vid-status-${art}`).innerHTML = `<a class="video-link" href="${d.video}" target="_blank">▶ видео</a>`;
        showStatus(art, true, '✓ видео');
      } else showStatus(art, false, '✗ ошибка');
    });
  });
}

async function saveRow(row, art) {
  const qty     = parseInt(row.querySelector('.field-qty').value, 10);
  const price   = parseInt(row.querySelector('.field-price').value, 10);
  const visible = row.querySelector('.field-visible').checked;
  const res = await apiFetch(`/api/admin/products/${art}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qty, price, visible })
  });
  showStatus(art, res.ok, res.ok ? '✓ сохранено' : '✗ ошибка');
}

function showStatus(art, ok, text) {
  const el = document.getElementById(`status-${art}`);
  if (!el) return;
  el.textContent = text; el.className = 'save-status' + (ok ? '' : ' err'); el.style.display = 'inline';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

document.getElementById('table-search').addEventListener('input', function () {
  const q = this.value.toLowerCase().trim();
  renderTable(q ? allProducts.filter(p => p.name.toLowerCase().includes(q) || p.article.includes(q)) : allProducts);
});

// ======== CONTACTS ========
async function loadContacts() {
  const res = await apiFetch('/api/admin/contacts');
  const c = await res.json();
  document.getElementById('c-phone').value = c.phone || '';
  document.getElementById('c-email').value = c.email || '';
  document.getElementById('c-max').value   = c.max   || '';
  document.getElementById('c-tg').value    = c.telegram || '';
  document.getElementById('c-vk').value    = c.vk    || '';
  // notifications
  document.getElementById('n-order-email').value = c.order_email || '';
  document.getElementById('n-smtp-host').value   = c.smtp_host   || 'smtp.gmail.com';
  document.getElementById('n-smtp-port').value   = c.smtp_port   || '587';
  document.getElementById('n-smtp-user').value   = c.smtp_user   || '';
  document.getElementById('n-smtp-pass').value   = c.smtp_pass   ? '••••••••' : '';
  document.getElementById('n-tg-token').value    = c.telegram_bot_token ? '••••••••' : '';
  document.getElementById('n-tg-chatid').value   = c.telegram_chat_id  || '';
}

document.getElementById('contacts-form').addEventListener('submit', async e => {
  e.preventDefault();
  const res = await apiFetch('/api/admin/contacts', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: document.getElementById('c-phone').value,
      email: document.getElementById('c-email').value,
      max:   document.getElementById('c-max').value,
      telegram: document.getElementById('c-tg').value,
      vk:    document.getElementById('c-vk').value
    })
  });
  showSaveStatus('save-contacts-status', res.ok);
});

document.getElementById('notify-email-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pass = document.getElementById('n-smtp-pass').value;
  const body = {
    order_email: document.getElementById('n-order-email').value,
    smtp_host:   document.getElementById('n-smtp-host').value,
    smtp_port:   document.getElementById('n-smtp-port').value,
    smtp_user:   document.getElementById('n-smtp-user').value,
  };
  if (pass && pass !== '••••••••') body.smtp_pass = pass;
  const res = await apiFetch('/api/admin/contacts', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  showSaveStatus('save-email-status', res.ok);
});

document.getElementById('notify-tg-form').addEventListener('submit', async e => {
  e.preventDefault();
  const tok = document.getElementById('n-tg-token').value;
  const body = { telegram_chat_id: document.getElementById('n-tg-chatid').value };
  if (tok && tok !== '••••••••') body.telegram_bot_token = tok;
  const res = await apiFetch('/api/admin/contacts', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  showSaveStatus('save-tg-status', res.ok);
});

function showSaveStatus(id, ok) {
  const el = document.getElementById(id);
  el.textContent = ok ? '✓ Сохранено' : '✗ Ошибка';
  el.style.color = ok ? '#16a34a' : '#dc2626';
  el.style.display = 'inline';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

// ======== HELPERS ========
function apiFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  opts.headers['x-admin-token'] = token;
  return fetch(url, opts);
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return escHtml(s); }
