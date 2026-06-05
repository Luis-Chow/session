const $ = (sel) => document.querySelector(sel);

// Identificadores de negocio en UN solo lugar (deben coincidir con los nombres en la BD).
const SUBSYSTEM = 'products';
const OBJECT = 'Product';
const M_LIST = 'listProducts';
const M_INSERT = 'insertProduct';
// Firma de permiso, mismo formato que arma el backend: subsystem-object-method.
const sig = (m) => [SUBSYSTEM, OBJECT, m].join('-');

// Identificadores para listar usuarios (subsistema security, objeto User).
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
const gmProfile = $('#gmProfile');
const gmMethod = $('#gmMethod');
const goProfile = $('#goProfile');
const goOption = $('#goOption');
const adminMsg = $('#adminMsg');
const btnGrantMethod = $('#btnGrantMethod');
const btnGrantOption = $('#btnGrantOption');

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
  // Cada botón se muestra SOLO si el perfil tiene ese permiso (concepto de "opciones").
  const puedeVer = (permissions || []).includes(sig(M_LIST));
  const puedeCargar = (permissions || []).includes(sig(M_INSERT));
  btnList.classList.toggle('hidden', !puedeVer);
  btnInsert.classList.toggle('hidden', !puedeCargar);
  prodName.classList.toggle('hidden', !puedeCargar);
  prodPrice.classList.toggle('hidden', !puedeCargar);
  // Seccion de usuarios: visible solo si el perfil tiene el metodo listUsers.
  const puedeVerUsuarios = (permissions || []).includes(sigUser(M_LIST_USERS));
  usersSection.classList.toggle('hidden', !puedeVerUsuarios);
  // Panel de admin: visible solo si el perfil tiene la opcion managePermissions.
  adminPanel.classList.toggle('hidden', !canManage);
  adminMsg.textContent = '';
  if (canManage) loadCatalog();
  // Limpia el estado de productos y usuarios al entrar.
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

// ---- Llamada genérica de negocio (vía /toProcess) ----
// Toda operación se pide igual: subsystem + objectName + methodName.
async function callMethod(subsystem, objectName, methodName, params) {
  return api('/toProcess', {
    method: 'POST',
    body: JSON.stringify({ subsystem, objectName, methodName, params })
  });
}

// ---- Productos ----
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
    // Aquí es donde el Cliente verá "Acceso denegado" (403).
    showProdMsg(data.msg || 'No se pudo cargar.', false);
  }
});

// ---- Usuarios (vía /toProcess, método security/User/listUsers) ----
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
    nameSpan.textContent = `#${u.user_id} · ${u.user_na}`;   // textContent: NO ejecuta HTML (evita XSS)
    const metaSpan = document.createElement('span');
    metaSpan.className = 'price';
    // 'profiles' viene como "2,3" (todos los perfiles del modelo muchos-a-muchos).
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

// ---- Panel de Admin (gestión de permisos) ----
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

// Pide el catálogo (perfiles, métodos, opciones) y llena los desplegables.
async function loadCatalog() {
  const { ok, data } = await api('/admin/catalog');
  if (!ok) return;
  const profileLabel = (p) => `${p.profile_id} · ${p.profile_na}`;
  fillSelect(gmProfile, data.profiles, 'profile_id', profileLabel);
  fillSelect(goProfile, data.profiles, 'profile_id', profileLabel);
  fillSelect(gmMethod, data.methods, 'method_id', (m) => `${m.subsystem_na}/${m.method_na}`);
  fillSelect(goOption, data.options, 'option_id', (o) => `${o.subsystem_na}/${o.option_na}`);
}

btnGrantMethod.addEventListener('click', async () => {
  const body = { profile_id: Number(gmProfile.value), method_id: Number(gmMethod.value) };
  const { ok, data } = await api('/admin/grantMethod', { method: 'POST', body: JSON.stringify(body) });
  showAdminMsg(data.msg, ok);
});

btnGrantOption.addEventListener('click', async () => {
  const body = { profile_id: Number(goProfile.value), option_id: Number(goOption.value) };
  const { ok, data } = await api('/admin/grantOption', { method: 'POST', body: JSON.stringify(body) });
  showAdminMsg(data.msg, ok);
});

(async () => {
  const { ok, data } = await api('/me');
  if (ok && data.objectSession) renderSession(data.objectSession, data.permissions, data.canManage);
})();
