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
const manageBox = $('#manageBox');
const userSelect = $('#userSelect');
const profileAssignSelect = $('#profileAssignSelect');
const manageMsg = $('#manageMsg');
const userProfilesList = $('#userProfilesList');

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

// Atajo para invocar cualquier metodo de seguridad por el dispatcher /toProcess.
function toProcess(objectName, methodName, params = []) {
  return api('/toProcess', {
    method: 'POST',
    body: JSON.stringify({ subsystem: 'security', objectName, methodName, params })
  });
}

function showManageMsg(text, ok = true) {
  manageMsg.textContent = text || '';
  manageMsg.className = 'msg ' + (ok ? 'ok' : 'error');
}

// Rellena un <select> con perfiles [{profile_id, profile_na}].
function fillProfileOptions(select, profiles) {
  select.innerHTML = '';
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.profile_id;
    opt.textContent = p.profile_na;
    select.appendChild(opt);
  }
}

// Carga los datos del bloque de admin: lista de usuarios y catalogo de perfiles.
async function loadManageData() {
  const usersRes = await toProcess('User', 'listUsers', []);
  if (usersRes.ok) {
    userSelect.innerHTML = '';
    for (const u of usersRes.data.data) {
      const opt = document.createElement('option');
      opt.value = u.user_id;
      opt.textContent = `#${u.user_id} · ${u.user_na}`;
      userSelect.appendChild(opt);
    }
  }
  const profRes = await toProcess('UserProfile', 'listProfiles', []);
  if (profRes.ok) fillProfileOptions(profileAssignSelect, profRes.data.data);
  await refreshUserProfiles();
}

// Muestra los perfiles que tiene asignados el usuario seleccionado.
async function refreshUserProfiles() {
  const user_id = Number(userSelect.value);
  userProfilesList.innerHTML = '';
  if (!user_id) return;
  const res = await toProcess('UserProfile', 'listUserProfiles', [user_id]);
  if (!res.ok) return;
  for (const p of res.data.data) {
    const item = document.createElement('div');
    item.className = 'item';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `perfil #${p.profile_id}`;
    const profSpan = document.createElement('span');
    profSpan.className = 'tag';
    profSpan.textContent = p.profile_na;
    item.appendChild(nameSpan);
    item.appendChild(profSpan);
    userProfilesList.appendChild(item);
  }
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

  // Bloque de admin para asignar/quitar perfiles: solo si la BD le concede el permiso.
  manageMsg.textContent = '';
  userProfilesList.innerHTML = '';
  if (session.canManageProfiles) {
    manageBox.classList.remove('hidden');
    loadManageData();
  } else {
    manageBox.classList.add('hidden');
  }
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

// Al elegir otro usuario, mostrar los perfiles que tiene.
userSelect.addEventListener('change', refreshUserProfiles);

$('#btnAssign').addEventListener('click', async () => {
  const params = [Number(userSelect.value), Number(profileAssignSelect.value)];
  const { ok, data } = await toProcess('UserProfile', 'addUserProfile', params);
  showManageMsg(ok ? 'Perfil asignado.' : (data.msg || 'Error.'), ok);
  if (ok) refreshUserProfiles();
});

$('#btnRemove').addEventListener('click', async () => {
  const params = [Number(userSelect.value), Number(profileAssignSelect.value)];
  const { ok, data } = await toProcess('UserProfile', 'removeUserProfile', params);
  showManageMsg(ok ? 'Perfil quitado.' : (data.msg || 'Error.'), ok);
  if (ok) refreshUserProfiles();
});

// Al recargar la pagina, restaura la sesion si la cookie sigue viva.
(async () => {
  const { ok, data } = await api('/me');
  if (ok && data.objectSession) renderSession(data.objectSession);
})();
