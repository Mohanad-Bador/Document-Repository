// API module: authentication, generic fetch wrappers, backend endpoints.
export const apiBase = "http://127.0.0.1:8000";

export const getToken = () => localStorage.getItem("access_token");
export const authHeaders = () => {
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
};

// Internal helpers
const enc = (v) => encodeURIComponent(v);
async function postExpectJson(url){
  const res = await apiFetch(url, { method:'POST' });
  if(!res.ok){ const txt = await res.text().catch(()=> ''); throw new Error(txt || `request failed (${res.status})`); }
  try { return await res.json(); } catch { return null; }
}
async function postReturnOk(url){ const res = await apiFetch(url, { method:'POST' }); return res?.ok ?? false; }
async function delReturnOk(url){ const res = await apiFetch(url, { method:'DELETE' }); if(!res.ok){ const txt = await res.text().catch(()=> ''); throw new Error(txt || `delete failed (${res.status})`); } return true; }

export async function apiFetch(url, options = {}) {
  options = { ...options };
  options.headers = { ...(options.headers || {}), ...authHeaders() };
  try {
    const res = await fetch(url, options);
    if (res.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/static/login.html';
      return res;
    }
    return res;
  } catch (err) {
    throw err;
  }
}

export async function apiJson(url, options = {}, fallback = null) {
  try {
    const res = await apiFetch(url, options);
    if (!res || !res.ok) return fallback;
    return await res.json();
  } catch (err) {
    console.error('apiJson error', err, url);
    return fallback;
  }
}

// Tag endpoints
export async function fetchAllTags() { return await apiJson(`${apiBase}/tags/`, {}, []); }
export async function fetchDocumentTags(documentId) { return await apiJson(`${apiBase}/tags/document/${encodeURIComponent(documentId)}`, {}, []); }
export async function createTagOnServer(tagName) { return await postExpectJson(`${apiBase}/tags/?tag_name=${enc(tagName)}`); }
export async function assignTagToDocument(documentId, tagId) { return await postReturnOk(`${apiBase}/tags/document/${enc(documentId)}/assign/${enc(tagId)}`); }
export async function removeTagFromDocument(documentId, tagId) { return await postReturnOk(`${apiBase}/tags/document/${enc(documentId)}/remove/${enc(tagId)}`); }

// Permissions & departments
// View (department) permissions endpoints (renamed paths)
export async function fetchViewPermissions(documentId) { return await apiJson(`${apiBase}/permissions/view/document/${encodeURIComponent(documentId)}`, {}, []); }
export async function grantViewPermission(documentId, { dept_id = null } = {}) { if (!dept_id) throw new Error('missing dept_id'); return await postExpectJson(`${apiBase}/permissions/view/grant?doc_id=${enc(documentId)}&dept_id=${enc(dept_id)}`); }
export async function revokeViewPermission(documentId, { dept_id = null } = {}) { if (!dept_id) throw new Error('missing dept_id'); return await postReturnOk(`${apiBase}/permissions/view/revoke?doc_id=${enc(documentId)}&dept_id=${enc(dept_id)}`); }

// Edit (per-user) permissions
export async function fetchEditPermissions(documentId) { return await apiJson(`${apiBase}/permissions/edit/document/${encodeURIComponent(documentId)}`, {}, []); }
export async function grantEditPermission(documentId, { user_id = null } = {}) { if(!user_id) throw new Error('missing user_id'); return await postExpectJson(`${apiBase}/permissions/edit/grant?doc_id=${enc(documentId)}&user_id=${enc(user_id)}`); }
export async function revokeEditPermission(documentId, { user_id = null } = {}) { if(!user_id) throw new Error('missing user_id'); return await postReturnOk(`${apiBase}/permissions/edit/revoke?doc_id=${enc(documentId)}&user_id=${enc(user_id)}`); }
export async function fetchEligibleEditUsers(documentId){ return await apiJson(`${apiBase}/permissions/edit/eligible/${encodeURIComponent(documentId)}`, {}, []); }
export async function fetchDepartments() { try { return await apiJson(`${apiBase}/permissions/departments/`, {}, []); } catch (err) { console.error('fetchDepartments error', err); return []; } }

// Documents
export async function fetchDocument(documentId) {
  try {
    // Try direct single-document endpoint first
    try {
      const res = await apiFetch(`${apiBase}/documents/${encodeURIComponent(documentId)}`);
      if (res && res.ok) {
        try { return await res.json(); } catch { /* continue to fallback */ }
      }
    } catch (err) {
      // ignore and fall back
    }

    // Fallback: fetch accessible documents (admin or /me) and find the desired document
    try {
      const listRes = await fetchAccessibleDocsRaw();
      if (!listRes || !listRes.ok) return null;
      const payload = await listRes.json();
      let docs = [];
      if (Array.isArray(payload)) docs = payload;
      else if (payload && Array.isArray(payload.documents)) docs = payload.documents;
      const found = docs.find(d => String(d.document_id) === String(documentId));
      return found ?? null;
    } catch (err) {
      console.error('fetchDocument fallback error', err);
      return null;
    }
  } catch (err) {
    console.error('fetchDocument error', err);
    return null;
  }
}
export async function fetchDocumentCapabilities(documentId){ return await apiJson(`${apiBase}/documents/${encodeURIComponent(documentId)}/capabilities`, {}, null); }
export async function fetchAccessibleDocsRaw() {
  // Try to detect admin users and return the admin list endpoint for them
  try {
    const meRes = await apiFetch(`${apiBase}/auth/me`);
    if (meRes && meRes.ok) {
      const me = await meRes.json();
      if (me && (me.role_name === 'admin' || me.role_id === 0)) {
        return await apiFetch(`${apiBase}/documents/`);
      }
    }
  } catch (err) {
    // ignore and fallback
  }
  return await apiFetch(`${apiBase}/documents/me`);
}
export async function fetchVersions(documentId) { return await apiJson(`${apiBase}/documents/${encodeURIComponent(documentId)}/versions`, {}, []); }
export async function updateDocumentVersion(documentId, formData) { return await apiFetch(`${apiBase}/documents/${enc(documentId)}/update`, { method: 'POST', body: formData }); }
export async function uploadDocumentFile(fd) { return await apiFetch(`${apiBase}/documents/upload`, { method: 'POST', body: fd }); }
export async function searchDocuments(params) { return await apiFetch(`${apiBase}/documents/search?${params.toString()}`); }


export async function toggleDocumentPublicity(documentId) { return await postExpectJson(`${apiBase}/documents/publicity/${enc(documentId)}/toggle`); }

// ---------------- Admin endpoints ----------------
// Users
export async function adminFetchUsers() { return await apiJson(`${apiBase}/admin/users`, {}, []); }
// Admin: list all documents
export async function adminFetchDocuments() { return await apiJson(`${apiBase}/documents/`, {}, []); }
// Roles
export async function adminFetchRoles() { return await apiJson(`${apiBase}/admin/roles`, {}, []); }
export async function adminCreateRole(name, description='') { return await postExpectJson(`${apiBase}/admin/roles?name=${enc(name)}${description?`&description=${enc(description)}`:''}`); }
export async function adminAssignUserRole(userId, roleId){ return await postExpectJson(`${apiBase}/admin/users/${enc(userId)}/role?role_id=${enc(roleId)}`); }
// Departments
export async function adminFetchDepartments() { return await apiJson(`${apiBase}/admin/departments`, {}, []); }
export async function adminCreateDepartment(name, description='') { return await postExpectJson(`${apiBase}/admin/departments?name=${enc(name)}${description?`&description=${enc(description)}`:''}`); }
export async function adminAssignUserDepartment(userId, departmentId){ return await postExpectJson(`${apiBase}/admin/users/${enc(userId)}/department?department_id=${enc(departmentId)}`); }
export async function adminDeleteRole(roleId){ return await delReturnOk(`${apiBase}/admin/roles/${enc(roleId)}`); }
export async function adminDeleteDepartment(deptId){ return await delReturnOk(`${apiBase}/admin/departments/${enc(deptId)}`); }
