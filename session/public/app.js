const $ = (sel) => document.querySelector(sel);

const SUBSYSTEM = 'products';
const OBJECT = 'Product';
const M_LIST = 'listProducts';
const M_INSERT = 'insertProduct';
const sig = (m) => [SUBSYSTEM, OBJECT, m].join('-');

const SEC_SUBSYSTEM = 'security';
const SEC_OBJECT = 'User';
const M_LIST_USERS = 'listUsers';
const sigUser = (m) => [SEC_SUBSYSTEM, SEC_OBJECT, m].join('-');

const tabLogin = $('#tabLogin');
const tabRegister = $('#tabRegister');
const formLogin = $('#formLogin');
const formRegister = $('#formRegister');
const panel = $('#panel');
const tabs = $('.tabs');
const msg = $('#msg');
const title = document.querySelector('h1');

const whoami = $('#whoami');
const btnList = $('#btnList');
const btnInsert = $('#btnInsert');
const prodName = $('#prodName');
const prodPrice = $('#prodPrice');
const prodMsg = $('#prodMsg');
const productList = $('#productList');

const usersSection = $('#usersSection');
const btnListUsers = $('#btnListUsers');
const usersMsg = $('#usersMsg');
const userList = $('#userList');

const adminPanel = $('#adminPanel');
const apUser = $('#apUser');
const apProfiles = $('#apProfiles');
const adminMsg = $('#adminMsg');

function showMsg(text, ok = true) {
  msg.textContent = text || '';
  msg.className = 'msg ' + (ok ? 'ok' : 'error');
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function showTab(which) {
  const isLogin = which === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabRegister.classList.toggle('active', !isLogin);
  formLogin.classList.toggle('hidden', !isLogin);
  formRegister.classList.toggle('hidden', isLogin);
  showMsg('');
}
tabLogin.addEventListener('click', () => showTab('login'));
tabRegister.addEventListener('click', () => showTab('register'));

function renderSession(session, permissions, canManage) {
  tabs.classList.add('hidden');
  formLogin.classList.add('hidden');
  formRegister.classList.add('hidden');
  title.classList.add('hidden');
  msg.classList.add('hidden');
  panel.classList.remove('hidden');
  if (session) {
    const perfiles = (session.profiles || [session.profile_id]).join(', ');
    whoami.textContent = `Conectado como ${session.user_na} (perfil ${perfiles})`;
  }
  const puedeVer = (permissions || []).includes(sig(M_LIST));
  const puedeCargar = (permissions || []).includes(sig(M_INSERT));
  btnList.classList.toggle('hidden', !puedeVer);
  btnInsert.classList.toggle('hidden', !puedeCargar);
  prodName.classList.toggle('hidden', !puedeCargar);
  prodPrice.classList.toggle('hidden', !puedeCargar);
  const puedeVerUsuarios = (permissions || []).includes(sigUser(M_LIST_USERS));
  usersSection.classList.toggle('hidden', !puedeVerUsuarios);
  adminPanel.classList.toggle('hidden', !canManage);
  adminMsg.textContent = '';
  if (canManage) loadCatalog();
  prodMsg.textContent = '';
  productList.innerHTML = '';
  usersMsg.textContent = '';
  userList.innerHTML = '';
}

function renderLoggedOut() {
  panel.classList.add('hidden');
  title.classList.remove('hidden');
  tabs.classList.remove('hidden');
  showTab('login');
}

formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(formRegister));
  const { ok, data } = await api('/register', { method: 'POST', body: JSON.stringify(body) });
  if (ok) {
    showMsg(data.msg, true);
    formRegister.reset();
    showTab('login');
  } else if (data.errors && data.errors.length) {
    showMsg('• ' + data.errors.join('\n• '), false);
  } else {
    showMsg(data.msg, false);
  }
});

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(formLogin));
  const { ok, data } = await api('/login', { method: 'POST', body: JSON.stringify(body) });
  showMsg(data.msg, ok);
  if (ok) {
    formLogin.reset();
    renderSession(data.objectSession, data.permissions, data.canManage);
  }
});

$('#btnLogout').addEventListener('click', async () => {
  const { ok, data } = await api('/logout', { method: 'POST' });
  showMsg(data.msg, ok);
  renderLoggedOut();
});

async function callMethod(subsystem, objectName, methodName, params) {
  return api('/toProcess', {
    method: 'POST',
    body: JSON.stringify({ subsystem, objectName, methodName, params })
  });
}

async function toProcess(methodName, params) {
  return callMethod(SUBSYSTEM, OBJECT, methodName, params);
}

function showProdMsg(text, ok) {
  prodMsg.textContent = text || '';
  prodMsg.className = 'msg ' + (ok ? 'ok' : 'error');
}

function renderProducts(rows) {
  productList.innerHTML = '';
  if (!rows || !rows.length) {
    productList.innerHTML = '<div class="product-item">Sin productos.</div>';
    return;
  }
  for (const p of rows) {
    const item = document.createElement('div');
    item.className = 'product-item';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.product_na;            // textContent: NO ejecuta HTML (evita XSS)
    const priceSpan = document.createElement('span');
    priceSpan.className = 'price';
    priceSpan.textContent = '$' + p.price;
    item.appendChild(nameSpan);
    item.appendChild(priceSpan);
    productList.appendChild(item);
  }
}

btnList.addEventListener('click', async () => {
  const { ok, data } = await toProcess(M_LIST, []);
  if (ok) {
    renderProducts(data.data);
    showProdMsg(`${data.data.length} producto(s).`, true);
  } else {
    showProdMsg(data.msg || 'Error al listar.', false);
  }
});

btnInsert.addEventListener('click', async () => {
  const name = prodName.value.trim();
  const price = parseFloat(prodPrice.value);
  if (!name) { showProdMsg('Escribe un nombre de producto.', false); return; }
  const { ok, data } = await toProcess(M_INSERT, [name, isNaN(price) ? 0 : price]);
  if (ok) {
    showProdMsg(`Producto "${name}" cargado.`, true);
    prodName.value = '';
    prodPrice.value = '';
    const refreshed = await toProcess(M_LIST, []);
    if (refreshed.ok) renderProducts(refreshed.data.data);
  } else {
    showProdMsg(data.msg || 'No se pudo cargar.', false);
  }
});

function showUsersMsg(text, ok) {
  usersMsg.textContent = text || '';
  usersMsg.className = 'msg ' + (ok ? 'ok' : 'error');
}

function renderUsers(rows) {
  userList.innerHTML = '';
  if (!rows || !rows.length) {
    userList.innerHTML = '<div class="product-item">Sin usuarios.</div>';
    return;
  }
  for (const u of rows) {
    const item = document.createElement('div');
    item.className = 'product-item';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `#${u.user_id} · ${u.user_na}`;
    const metaSpan = document.createElement('span');
    metaSpan.className = 'price';
    const profs = String(u.profiles || u.profile_id || '').split(',').filter(Boolean);
    metaSpan.textContent = (profs.length > 1 ? 'perfiles ' : 'perfil ') + profs.join(', ');
    item.appendChild(nameSpan);
    item.appendChild(metaSpan);
    userList.appendChild(item);
  }
}

btnListUsers.addEventListener('click', async () => {
  const { ok, data } = await callMethod(SEC_SUBSYSTEM, SEC_OBJECT, M_LIST_USERS, []);
  if (ok) {
    renderUsers(data.data);
    showUsersMsg(`${data.data.length} usuario(s).`, true);
  } else {
    showUsersMsg(data.msg || 'No se pudo listar usuarios.', false);
  }
});

function showAdminMsg(text, ok) {
  adminMsg.textContent = text || '';
  adminMsg.className = 'msg ' + (ok ? 'ok' : 'error');
}

function fillSelect(sel, items, valueKey, labelFn) {
  sel.innerHTML = '';
  for (const it of items) {
    const opt = document.createElement('option');
    opt.value = it[valueKey];
    opt.textContent = labelFn(it);
    sel.appendChild(opt);
  }
}

let catalog = { profiles: [], users: [], userProfiles: [] };

const profileLabel = (p) => `${p.profile_id} · ${p.profile_na}`;
const userLabel = (u) => `#${u.user_id} · ${u.user_na}`;

function renderUserProfiles() {
  const userId = Number(apUser.value);
  const assigned = new Set(
    catalog.userProfiles.filter((up) => up.user_id === userId).map((up) => up.profile_id)
  );
  apProfiles.innerHTML = '';
  for (const p of catalog.profiles) {
    const label = document.createElement('label');
    label.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = assigned.has(p.profile_id);
    box.dataset.profileId = p.profile_id;
    const span = document.createElement('span');
    span.textContent = p.profile_na;
    label.appendChild(box);
    label.appendChild(span);
    apProfiles.appendChild(label);
  }
}

async function loadCatalog() {
  const { ok, data } = await api('/admin/catalog');
  if (!ok) return;
  catalog = {
    profiles: data.profiles || [],
    users: data.users || [],
    userProfiles: data.userProfiles || []
  };
  fillSelect(apUser, catalog.users, 'user_id', userLabel);
  renderUserProfiles();
}

apUser.addEventListener('change', renderUserProfiles);

apProfiles.addEventListener('change', async (e) => {
  const box = e.target;
  if (box.type !== 'checkbox') return;
  const user_id = Number(apUser.value);
  const profile_id = Number(box.dataset.profileId);
  const assign = box.checked;
  const path = assign ? '/admin/assignProfile' : '/admin/unassignProfile';
  const { ok, data } = await api(path, { method: 'POST', body: JSON.stringify({ user_id, profile_id }) });
  showAdminMsg(data.msg, ok);
  if (ok) {
    if (assign) {
      catalog.userProfiles.push({ user_id, profile_id });
    } else {
      catalog.userProfiles = catalog.userProfiles.filter(
        (up) => !(up.user_id === user_id && up.profile_id === profile_id)
      );
    }
  } else {
    box.checked = !assign;
  }
});

(async () => {
  const { ok, data } = await api('/me');
  if (ok && data.objectSession) renderSession(data.objectSession, data.permissions, data.canManage);
})();
