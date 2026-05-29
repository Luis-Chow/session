const $ = (sel) => document.querySelector(sel);

const tabLogin = $('#tabLogin');
const tabRegister = $('#tabRegister');
const formLogin = $('#formLogin');
const formRegister = $('#formRegister');
const panel = $('#panel');
const tabs = $('.tabs');
const msg = $('#msg');
const title = document.querySelector('h1');

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

function renderSession() {
  tabs.classList.add('hidden');
  formLogin.classList.add('hidden');
  formRegister.classList.add('hidden');
  title.classList.add('hidden');
  msg.classList.add('hidden');
  panel.classList.remove('hidden');
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
    renderSession(data.objectSession);
  }
});

$('#btnLogout').addEventListener('click', async () => {
  const { ok, data } = await api('/logout', { method: 'POST' });
  showMsg(data.msg, ok);
  renderLoggedOut();
});

(async () => {
  const { ok, data } = await api('/me');
  if (ok && data.objectSession) renderSession(data.objectSession);
})();
