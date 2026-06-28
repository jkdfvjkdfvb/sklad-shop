'use strict';

let token = sessionStorage.getItem('adminToken') || '';
let allProducts = [];

// ======== AUTH ========
async function login() {
  const pwd = document.getElementById('login-pwd').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    if (!res.ok) { errEl.textContent = 'Неверный пароль'; errEl.style.display = 'block'; return; }
    const data = await res.json();
    token = data.token;
    sessionStorage.setItem('adminToken', token);
    showAdmin();
  } catch {
    errEl.textContent = 'Ошибка сети'; errEl.style.display = 'block';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST', headers: { 'x-admin-token': token } }).catch(() => {});
  token = '';
  sessionStorage.removeItem('adminToken');
  document.getElementById('login-section').style.display = '';
  document.getElementById('admin-section').style.display = 'none';
  document.getElementById('login-pwd').value = '';
}

document.getElementById('login-form').addEventListener('submit', e => { e.preventDefault(); login(); });
document.getElementById('login-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
document.getElementById('logout-btn').addEventListener('click', logout);

// ======== INIT ========
async function showAdmin() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('admin-section').style.display = '';
  await Promise.all([loadProducts(), loadContacts()]);
}

// Auto-login if token stored
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
  const hasImg = p.image;
  const imgEl = hasImg
    ? `<img class="thumb" src="${p.image}" alt="" onerror="this.style.display='none'">`
    : `<div class="thumb-placeholder">нет фото</div>`;
  const hasVid = p.video;
  const vidEl = hasVid
    ? `<a class="video-link" href="${p.video}" target="_blank">▶ видео</a>`
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
      const fd = new FormData();
      fd.append('image', this.files[0]);
      const res = await apiFetch(`/api/admin/products/${art}/image`, { method: 'POST', body: fd });
      if (res.ok) {
        const d = await res.json();
        const thumb = row.querySelector('.thumb, .thumb-placeholder');
        if (thumb) { thumb.outerHTML = `<img class="thumb" src="${d.image}?t=${Date.now()}" alt="">`; }
        showStatus(art, true, '✓ фото');
      } else {
        showStatus(art, false, '✗ ошибка');
      }
    });

    row.querySelector('.upload-vid').addEventListener('change', async function () {
      if (!this.files[0]) return;
      const fd = new FormData();
      fd.append('video', this.files[0]);
      const res = await apiFetch(`/api/admin/products/${art}/video`, { method: 'POST', body: fd });
      if (res.ok) {
        const d = await res.json();
        document.getElementById(`vid-status-${art}`).innerHTML = `<a class="video-link" href="${d.video}" target="_blank">▶ видео</a>`;
        showStatus(art, true, '✓ видео');
      } else {
        showStatus(art, false, '✗ ошибка');
      }
    });
  });
}

async function saveRow(row, art) {
  const qty = parseInt(row.querySelector('.field-qty').value, 10);
  const price = parseInt(row.querySelector('.field-price').value, 10);
  const visible = row.querySelector('.field-visible').checked;
  const res = await apiFetch(`/api/admin/products/${art}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qty, price, visible })
  });
  showStatus(art, res.ok, res.ok ? '✓ сохранено' : '✗ ошибка');
}

function showStatus(art, ok, text) {
  const el = document.getElementById(`status-${art}`);
  if (!el) return;
  el.textContent = text;
  el.className = 'save-status' + (ok ? '' : ' err');
  el.style.display = 'inline';
  setTimeout(() => { el.style.display = 'none'; }, 2500);
}

// Table search
document.getElementById('table-search').addEventListener('input', function () {
  const q = this.value.toLowerCase().trim();
  renderTable(q ? allProducts.filter(p => p.name.toLowerCase().includes(q) || p.article.includes(q)) : allProducts);
});

// ======== CONTACTS ========
async function loadContacts() {
  const res = await apiFetch('/api/contacts');
  const c = await res.json();
  document.getElementById('c-phone').value = c.phone || '';
  document.getElementById('c-email').value = c.email || '';
  document.getElementById('c-max').value = c.max || '';
  document.getElementById('c-tg').value = c.telegram || '';
  document.getElementById('c-vk').value = c.vk || '';
}

document.getElementById('contacts-form').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    phone: document.getElementById('c-phone').value,
    email: document.getElementById('c-email').value,
    max:   document.getElementById('c-max').value,
    telegram: document.getElementById('c-tg').value,
    vk:    document.getElementById('c-vk').value
  };
  const res = await apiFetch('/api/admin/contacts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const st = document.getElementById('save-contacts-status');
  st.textContent = res.ok ? '✓ Контакты сохранены' : '✗ Ошибка сохранения';
  st.style.color = res.ok ? '#16a34a' : '#dc2626';
  st.style.display = 'inline';
  setTimeout(() => { st.style.display = 'none'; }, 2500);
});

// ======== HELPERS ========
function apiFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  if (!(opts.body instanceof FormData)) {
    // keep explicit Content-Type if set
  }
  opts.headers['x-admin-token'] = token;
  return fetch(url, opts);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return escHtml(s); }
