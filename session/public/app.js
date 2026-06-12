const $ = (sel) => document.querySelector(sel);

const tabLogin = $('#tabLogin');
const tabRegister = $('#tabRegister');
const tabs = $('.tabs');
const formLogin = $('#formLogin');
const formRegister = $('#formRegister');
const panel = $('#panel');
const msg = $('#msg');
const title = document.querySelector('h1');
const whoami = $('#whoami');
const resultMsg = $('#resultMsg');
const resultList = $('#resultList');

function showMsg(text, ok = true) {
  msg.textContent = text || '';
  msg.className = 'msg ' + (ok ? 'ok' : 'error');
}

function showResultMsg(text, ok = true) {
  resultMsg.textContent = text || '';
  resultMsg.className = 'msg ' + (ok ? 'ok' : 'error');
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

function renderSession(session) {
  title.classList.add('hidden');
  tabs.classList.add('hidden');
  formLogin.classList.add('hidden');
  formRegister.classList.add('hidden');
  msg.classList.add('hidden');
  panel.classList.remove('hidden');
  whoami.textContent = `Conectado como ${session.user_na} (perfil ${session.profile_id})`;
  showResultMsg('');
  resultList.innerHTML = '';
}

function renderLoggedOut() {
  panel.classList.add('hidden');
  title.classList.remove('hidden');
  tabs.classList.remove('hidden');
  msg.classList.remove('hidden');
  showTab('login');
}

formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(formRegister));
  const { ok, data } = await api('/register', { method: 'POST', body: JSON.stringify(body) });
  if (ok) {
    formRegister.reset();
    showTab('login');
    showMsg(data.msg, true);
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
    renderSession(data.objectSession);
  }
});

$('#btnLogout').addEventListener('click', async () => {
  const { ok, data } = await api('/logout', { method: 'POST' });
  renderLoggedOut();
  showMsg(data.msg, ok);
});

function renderUsers(rows) {
  resultList.innerHTML = '';
  for (const u of rows) {
    const item = document.createElement('div');
    item.className = 'item';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `#${u.user_id} · ${u.user_na}`;   // textContent: NO ejecuta HTML (evita XSS)
    const profSpan = document.createElement('span');
    profSpan.className = 'tag';
    profSpan.textContent = u.profile_na;
    item.appendChild(nameSpan);
    item.appendChild(profSpan);
    resultList.appendChild(item);
  }
}

// j = { subsystem, objectName, methodName, params } -> POST /toProcess
$('#btnListUsers').addEventListener('click', async () => {
  const j = {
    subsystem: 'security',
    objectName: 'User',
    methodName: 'listUsers',
    params: []
  };
  const { ok, data } = await api('/toProcess', { method: 'POST', body: JSON.stringify(j) });
  if (ok) {
    renderUsers(data.data);
    showResultMsg(`Permitido: ${data.data.length} usuario(s).`, true);
  } else {
    resultList.innerHTML = '';
    showResultMsg(data.msg || 'Error.', false);
  }
});

// Al recargar la pagina, restaura la sesion si la cookie sigue viva.
(async () => {
  const { ok, data } = await api('/me');
  if (ok && data.objectSession) renderSession(data.objectSession);
})();
