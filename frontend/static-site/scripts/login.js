const apiBase = "http://127.0.0.1:8000";
function setToken(t){ localStorage.setItem("access_token", t); }

const form = document.getElementById('loginForm');
const statusEl = document.getElementById('loginStatus');
const submitBtn = document.getElementById('btnLogin');

if (form) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    statusEl.textContent = '';
    submitBtn.disabled = true;
    const username = document.getElementById('username')?.value ?? '';
    const password = document.getElementById('password')?.value ?? '';
    const body = new URLSearchParams();
    body.append('username', username);
    body.append('password', password);
    try {
      const res = await fetch(apiBase + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e){ console.warn('login not JSON', e); }
      if (!res.ok) {
        statusEl.textContent = data?.detail || 'Login failed';
        submitBtn.disabled = false;
        return;
      }
      if (data?.access_token) {
        setToken(data.access_token);
        window.location.href = '/static/dashboard.html';
      } else {
        statusEl.textContent = 'No token returned';
        submitBtn.disabled = false;
      }
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Network error';
      submitBtn.disabled = false;
    }
  });
} else {
  // fallback: bind click to the button if form missing
  document.getElementById('btnLogin')?.addEventListener('click', (e) => e.preventDefault());
}