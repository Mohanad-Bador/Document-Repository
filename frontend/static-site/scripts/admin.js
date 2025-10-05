import { apiBase, authHeaders, apiFetch, adminFetchUsers, adminFetchRoles, adminFetchDepartments, adminCreateRole, adminCreateDepartment, adminAssignUserRole, adminAssignUserDepartment, adminDeleteRole, adminDeleteDepartment } from './api.js';

const noticeEl = document.getElementById('adminNotice');
const usersBody = document.getElementById('usersBody');
const usersStatus = document.getElementById('usersStatus');
const rolesList = document.getElementById('rolesList');
const rolesStatus = document.getElementById('rolesStatus');
const deptsList = document.getElementById('deptsList');
const deptsStatus = document.getElementById('deptsStatus');

let rolesCache = [];
let deptsCache = [];

// ---------- Small DOM helpers ----------
const qs = (sel, root=document) => root.querySelector(sel);
const ce = (tag, props={}) => Object.assign(document.createElement(tag), props);

function setNotice(msg, ok=false){ if(noticeEl){ noticeEl.textContent=msg||''; noticeEl.className = ok? 'notice success':'notice'; } }
function setStatus(el, msg, ok=false){ if(!el) return; el.textContent = msg||''; el.className = ok? 'notice success':'notice'; }

// Unified confirm + action helper
async function confirmThen(message, action, onError){
  if(!confirm(message)) return false;
  try { await action(); return true; }
  catch(err){ onError?.(err); return false; }
}

async function ensureAdmin(){
  try {
    const res = await apiFetch(`${apiBase}/auth/me`, { headers: { ...authHeaders() } });
    if(!res.ok) { window.location.href='/static/login.html'; return false; }
    const me = await res.json();
    const isAdmin = me.role_name === 'admin' || me.role_id === 0;
    if(!isAdmin){ setNotice('Admin access required.'); return false; }
    return true;
  } catch { window.location.href='/static/login.html'; return false; }
}

function buildDeleteButton(entityName, onDelete){
  const btn = ce('button', { type:'button', textContent:'✕', title:`Delete ${entityName}` });
  btn.className='btn secondary'; btn.style.marginLeft='8px';
  btn.addEventListener('click', onDelete);
  return btn;
}

function renderList(container, items, { allowDelete, format, onDelete, statusEl, deletedMsg }){
  if(!container) return; container.innerHTML='';
  items.forEach(item=>{
    const li = ce('li');
    li.appendChild(ce('span', { textContent: format(item) }));
    if(allowDelete(item)){
      li.appendChild(buildDeleteButton('item', async ()=>{
        const label = format(item).split(' – ')[0];
        const ok = await confirmThen(`Delete ${label}?`, async ()=>{ await onDelete(item); }, err=> setStatus(statusEl, 'Delete failed: '+err.message));
        if(ok){ setStatus(statusEl, deletedMsg, true); await refreshAll(); }
      }));
    }
    container.appendChild(li);
  });
}

function renderRoles(){
  renderList(rolesList, rolesCache, {
    allowDelete: r => r.name?.toLowerCase() !== 'admin' && r.role_id !== 0,
    format: r => r.name + (r.description?` – ${r.description}`:''),
    onDelete: (r)=> adminDeleteRole(r.role_id),
    statusEl: rolesStatus,
    deletedMsg: 'Role deleted'
  });
}
function renderDepts(){
  renderList(deptsList, deptsCache, {
    allowDelete: () => true,
    format: d => d.name + (d.description?` – ${d.description}`:''),
    onDelete: (d)=> adminDeleteDepartment(d.department_id),
    statusEl: deptsStatus,
    deletedMsg: 'Department deleted'
  });
}

function buildSelect(options, selectedId, placeholder){
  const sel = ce('select');
  sel.appendChild(ce('option', { value:'', textContent: placeholder||'—'}));
  options.forEach(o=>{
    const value = o.role_id ?? o.department_id;
    sel.appendChild(ce('option', { value, textContent:o.name, selected: value==selectedId }));
  });
  return sel;
}

const fullName = (u) => (u.first_name && u.last_name) ? `${u.first_name} ${u.last_name}` : '';

function renderUsers(users){
  if(!usersBody) return; usersBody.innerHTML='';
  if(!users.length){ const tr=ce('tr'); const td=ce('td',{ textContent:'No users' }); td.colSpan=6; tr.appendChild(td); usersBody.appendChild(tr); return; }
  users.forEach(u=>{
    const tr = ce('tr');
    ['user_id','username'].forEach(key=> tr.appendChild(ce('td',{ textContent:u[key] })));
    tr.appendChild(ce('td',{ textContent: fullName(u) }));
    tr.appendChild(ce('td',{ textContent: u.email }));
    // Role select
    const roleTd = ce('td');
    const selRole = buildSelect(rolesCache, u.role_id, 'role');
    selRole.addEventListener('change', ()=> selRole.value && adminAssignUserRole(u.user_id, selRole.value).then(()=> setStatus(usersStatus,`Role updated for ${u.username}`,true)).catch(e=> setStatus(usersStatus,`Role update failed: ${e.message}`)) );
    roleTd.appendChild(selRole); tr.appendChild(roleTd);
    // Dept select
    const deptTd = ce('td');
    const selDept = buildSelect(deptsCache, u.department_id, 'dept');
    selDept.addEventListener('change', ()=> selDept.value && adminAssignUserDepartment(u.user_id, selDept.value).then(()=> setStatus(usersStatus,`Department updated for ${u.username}`,true)).catch(e=> setStatus(usersStatus,`Department update failed: ${e.message}`)) );
    deptTd.appendChild(selDept); tr.appendChild(deptTd);
    usersBody.appendChild(tr);
  });
}

async function refreshAll(){
  setStatus(usersStatus, 'Loading users...');
  try {
    [rolesCache, deptsCache] = await Promise.all([adminFetchRoles(), adminFetchDepartments()]);
    renderRoles();
    renderDepts();
    const users = (await adminFetchUsers()).sort((a,b)=> (a.user_id||0) - (b.user_id||0));
    renderUsers(users);
    setStatus(usersStatus, `Loaded ${users.length} users`, true);
  } catch(err){ setStatus(usersStatus, 'Failed to load admin data: '+ err.message); }
}

// Role creation
qs('#roleForm')?.addEventListener('submit', ev => {
  ev.preventDefault();
  const form = ev.currentTarget instanceof HTMLFormElement ? ev.currentTarget : null;
  const nameEl = qs('#roleName');
  const descEl = qs('#roleDesc');
  const name = nameEl?.value?.trim(); if(!name) return;
  const desc = descEl?.value?.trim() || '';
  setStatus(rolesStatus,'Creating role...');
  adminCreateRole(name, desc)
    .then(() => {
      setStatus(rolesStatus,'Role created',true);
      form && typeof form.reset === 'function' && form.reset();
      return refreshAll();
    })
    .catch(err => setStatus(rolesStatus,'Create failed: '+ err.message));
});

// Department creation
qs('#deptForm')?.addEventListener('submit', ev => {
  ev.preventDefault();
  const form = ev.currentTarget instanceof HTMLFormElement ? ev.currentTarget : null;
  const nameEl = qs('#deptName');
  const descEl = qs('#deptDesc');
  const name = nameEl?.value?.trim(); if(!name) return;
  const desc = descEl?.value?.trim() || '';
  setStatus(deptsStatus,'Creating department...');
  adminCreateDepartment(name, desc)
    .then(() => {
      setStatus(deptsStatus,'Department created',true);
      form && typeof form.reset === 'function' && form.reset();
      return refreshAll();
    })
    .catch(err => setStatus(deptsStatus,'Create failed: '+ err.message));
});

// Logout button
qs('#btnLogout')?.addEventListener('click', () => { try { localStorage.removeItem('access_token'); } catch{} window.location.href='/static/login.html'; });

async function init(){ if(await ensureAdmin()) await refreshAll(); }
document.readyState==='loading' ? document.addEventListener('DOMContentLoaded', init) : init();
