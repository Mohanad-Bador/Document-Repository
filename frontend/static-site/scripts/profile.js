import { apiBase, authHeaders, apiFetch } from './api.js';

const noticeEl = document.getElementById('notice');
const searchSection = document.getElementById('search');
const btnSearch = document.getElementById('btnSearch');
const nameEl = document.getElementById('userName');
const roleEl = document.getElementById('userRole');
const deptEl = document.getElementById('userDept');

export async function fetchProfile() {
  const headers = { ...authHeaders() };
  if (!headers.Authorization) {
    localStorage.removeItem('access_token');
    window.location.href = '/static/login.html';
    return null;
  }
  try {
    const res = await apiFetch(`${apiBase}/auth/me`, { headers });
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('access_token');
        window.location.href = '/static/login.html';
        return null;
      }
      console.warn('profile fetch failed', res.status, res.statusText);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('profile fetch error', err); return null;
  }
}

export function showNotice(msg) {
  if (noticeEl) noticeEl.textContent = msg;
  if (searchSection) searchSection.style.display = 'none';
  if (btnSearch) btnSearch.disabled = true;
}
export function clearNotice() {
  if (noticeEl) noticeEl.textContent = '';
  if (searchSection) searchSection.style.display = '';
  if (btnSearch) btnSearch.disabled = false;
}
export function renderProfile(profile) {
  const first = profile.first_name; const last = profile.last_name;
  const displayName = (first && last) ? `${first} ${last}` : (profile.username ?? profile.email ?? 'User');
  const roleName = profile.role_name; const deptName = profile.department_name;
  if (nameEl) nameEl.textContent = displayName;
  if (roleEl) roleEl.textContent = `Role: ${roleName}`;
  if (deptEl) deptEl.textContent = `Department: ${deptName}`;
  const hasRole = profile.role_id != null;
  const hasDept = profile.department_id != null || Boolean(profile.department_name);
  if (!hasRole || !hasDept) { showNotice('Your account is pending assignment. An administrator must assign a role and a department before you can access the dashboard.'); return false; }
  clearNotice(); return true;
}
