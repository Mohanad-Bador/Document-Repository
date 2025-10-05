const apiBase = "http://127.0.0.1:8000";
async function doLogin(username, password){
  const body = new URLSearchParams();
  body.append('username', username); body.append('password', password);
  const res = await fetch(apiBase + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.access_token ?? null;
}

document.getElementById('btnSignup')?.addEventListener('click', async () => {
  const username = document.getElementById('su_username')?.value ?? '';
  const password = document.getElementById('su_password')?.value ?? '';
  const email = document.getElementById('su_email')?.value ?? '';
  const first_name = document.getElementById('su_firstname')?.value ?? '';
  const last_name = document.getElementById('su_lastname')?.value ?? '';
  const birthdate = document.getElementById('su_birth')?.value ?? '';
  const phone = document.getElementById('su_phone')?.value ?? '';

  try {
    const res = await fetch(apiBase + '/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email, first_name, last_name, birthdate, phone }),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e){ console.warn('signup not JSON', e); }
    if (!res.ok) {
      document.getElementById('signupStatus').textContent = data?.detail || 'Signup failed';
      return;
    }
    // auto-login after signup
    const token = await doLogin(username, password);
    if (token) {
      localStorage.setItem('access_token', token);
      window.location.href = '/static/dashboard.html';
    } else {
      document.getElementById('signupStatus').textContent = 'Signed up but auto-login failed';
    }
  } catch (err) {
    console.error(err);
    document.getElementById('signupStatus').textContent = 'Network error';
  }
});