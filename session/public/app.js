const $ = (sel) => document.querySelector(sel);

const formLogin = $('#formLogin');
const formRegister = $('#formRegister');
const registerBox = $('#registerBox');
const registerMsg = $('#registerMsg');
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

function showRegisterMsg(text, ok = true) {
  registerMsg.textContent = text || '';
  registerMsg.className = 'msg ' + (ok ? 'ok' : 'error');
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

// Habilita o bloquea los campos del formulario de "Crear cuenta".
// Todos ven el bloque, pero solo el admin puede escribir y enviarlo.
function setRegisterEnabled(enabled) {
  for (const field of formRegister.elements) {
    field.disabled = !enabled;
  }
}

function renderSession(session) {
  title.classList.add('hidden');
  formLogin.classList.add('hidden');
  msg.classList.add('hidden');
  panel.classList.remove('hidden');
  whoami.textContent = `Conectado como ${session.user_na} (perfil ${session.profile_id})`;
  // El bloque se muestra a todos, pero solo se habilita si la BD le concede el permiso.
  const canRegister = !!session.canRegister;
  registerBox.classList.remove('hidden');
  formRegister.reset();
  setRegisterEnabled(canRegister);
  showRegisterMsg(canRegister ? '' : 'No tienes permiso para crear cuentas.', false);
  showResultMsg('');
  resultList.innerHTML = '';
}

function renderLoggedOut() {
  panel.classList.add('hidden');
  registerBox.classList.add('hidden');
  title.classList.remove('hidden');
  formLogin.classList.remove('hidden');
  msg.classList.remove('hidden');
  showMsg('');
}

formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(formRegister));
  const { ok, data } = await api('/register', { method: 'POST', body: JSON.stringify(body) });
  if (ok) {
    formRegister.reset();
    showRegisterMsg(data.msg, true);
  } else if (data.errors && data.errors.length) {
    showRegisterMsg('• ' + data.errors.join('\n• '), false);
  } else {
    showRegisterMsg(data.msg, false);
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
    nameSpan.textContent = `#${u.user_id} · ${u.user_na}`;
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
