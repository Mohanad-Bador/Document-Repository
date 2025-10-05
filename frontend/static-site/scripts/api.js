// API module: authentication, generic fetch wrappers, backend endpoints.
export const apiBase = "http://127.0.0.1:8000";

export const getToken = () => localStorage.getItem("access_token");
export const authHeaders = () => {
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
};

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
export async function createTagOnServer(tagName) { const res = await apiFetch(`${apiBase}/tags/?tag_name=${encodeURIComponent(tagName)}`, { method: 'POST' }); if (!res.ok) { const txt = await res.text().catch(() => ''); throw new Error(txt || `create tag failed (${res.status})`); } return await res.json(); }
export async function assignTagToDocument(documentId, tagId) { const res = await apiFetch(`${apiBase}/tags/document/${encodeURIComponent(documentId)}/assign/${encodeURIComponent(tagId)}`, { method: 'POST' }); return res?.ok ?? false; }
export async function removeTagFromDocument(documentId, tagId) { const res = await apiFetch(`${apiBase}/tags/document/${encodeURIComponent(documentId)}/remove/${encodeURIComponent(tagId)}`, { method: 'POST' }); return res?.ok ?? false; }

// Permissions & departments
export async function fetchViewPermissions(documentId) { return await apiJson(`${apiBase}/permissions/document/${encodeURIComponent(documentId)}`, {}, []); }
export async function grantViewPermission(documentId, { dept_id = null } = {}) { if (!dept_id) throw new Error('missing dept_id'); const url = `${apiBase}/permissions/grant?doc_id=${encodeURIComponent(documentId)}&dept_id=${encodeURIComponent(dept_id)}`; const res = await apiFetch(url, { method: 'POST' }); if (!res.ok) { const txt = await res.text().catch(()=> ''); throw new Error(txt || `grant failed (${res.status})`); } try { return await res.json(); } catch { return null; } }
export async function revokeViewPermission(documentId, { dept_id = null } = {}) { if (!dept_id) throw new Error('missing dept_id'); const url = `${apiBase}/permissions/revoke?doc_id=${encodeURIComponent(documentId)}&dept_id=${encodeURIComponent(dept_id)}`; const res = await apiFetch(url, { method: 'POST' }); return res?.ok ?? false; }
export async function fetchDepartments() { try { return await apiJson(`${apiBase}/permissions/departments/`, {}, []); } catch (err) { console.error('fetchDepartments error', err); return []; } }

// Documents
export async function fetchDocument(documentId) { try { return await apiJson(`${apiBase}/documents/${encodeURIComponent(documentId)}`, {}, null); } catch (err) { console.error('fetchDocument error', err); return null; } }
export async function fetchAccessibleDocsRaw() { return await apiFetch(`${apiBase}/documents/me`, { headers: { ...authHeaders() } }); }
export async function fetchVersions(documentId) { return await apiJson(`${apiBase}/documents/${encodeURIComponent(documentId)}/versions`, {}, []); }
export async function updateDocumentVersion(documentId, formData) { return await apiFetch(`${apiBase}/documents/${encodeURIComponent(documentId)}/update`, { method: 'POST', body: formData }); }
export async function uploadDocumentFile(fd) { return await apiFetch(`${apiBase}/documents/upload`, { method: 'POST', body: fd }); }
export async function searchDocuments(params) { return await apiFetch(`${apiBase}/documents/search?${params.toString()}`); }
