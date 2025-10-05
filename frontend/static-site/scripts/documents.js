// listing, searching, rendering document cards
import { apiBase, fetchAccessibleDocsRaw, searchDocuments } from './api.js';
import { escapeHtml, handleFileRequest } from './utils.js';

const resultsEl = document.getElementById('results');
const btnSearch = document.getElementById('btnSearch');

export function setupDocuments(getOpenDetailsModalFor) {
  async function fetchAccessibleDocuments() {
    try {
      const res = await fetchAccessibleDocsRaw();
      if (!res || !res.ok) {
        if (res && res.status === 401) return;
        console.warn('failed to fetch accessible documents', res && res.status, res && res.statusText);
        if (resultsEl) resultsEl.textContent = 'Could not load documents.'; return;
      }
      const payload = await res.json();
      // Admin list returns an array, accessible endpoint returns { user, documents }
  let docs = [];
  if (Array.isArray(payload)) docs = payload;
  else if (payload && Array.isArray(payload.documents)) docs = payload.documents;
  if (Array.isArray(docs)) docs.sort((a,b)=> (a.document_id||0) - (b.document_id||0));
  await renderDocuments(docs);
    } catch (err) {
      console.error('network error fetching accessible documents', err);
      if (resultsEl) resultsEl.textContent = 'Network error loading documents';
    }
  }

  async function renderDocuments(docs) {
    if (!resultsEl) return;
    if (!Array.isArray(docs) || docs.length === 0) { resultsEl.innerHTML = '<div style="color:#555">No accessible documents.</div>'; return; }
    // Removed unused canEdit logic (edit gating handled inside details modal via capabilities endpoint)
    const html = docs.map(d => {
      const id = escapeHtml(d.document_id ?? '—');
      const title = escapeHtml(d.latest_version_title ?? d.latest_version?.title ?? 'Untitled');
      const isPublic = d.is_public ? 'Public' : 'Private';
      const deptName = escapeHtml(d.department_name ?? d.department?.name ?? '—');
      const latestVersionId = escapeHtml(d.latest_version?.version_id ?? '');
      const latestFileName = escapeHtml(d.latest_version?.file_name ?? '');
      const tags = Array.isArray(d.tags) && d.tags.length
        ? d.tags.map(t => `<span class="tag">${escapeHtml(t.tag_name ?? t)}</span>`).join(' ')
        : '<span class="tag muted">no tags</span>';
      return `<article class="doc-card" data-id="${id}" data-latest-version-id="${latestVersionId}" data-file-name="${latestFileName}">
        <div class="doc-header"><h3 class="doc-title">${title}</h3></div>
        <div class="doc-meta">ID: ${id} • Dept: ${deptName} • ${isPublic}</div>
        <div class="doc-tags" style="margin-top:8px">${tags}</div>
        <div class="doc-actions" style="margin-top:10px">
          <button class="btn" data-action="view" data-id="${id}">View</button>
          <button class="btn secondary" data-action="download" data-id="${id}">Download</button>
          <button class="btn secondary doc-details-btn" data-action="details" data-id="${id}">Details</button>
        </div>
      </article>`;
    }).join('');
    resultsEl.innerHTML = html;
    attachDocumentCardHandlers();
    // Details button now visible for all accessible documents (read-only modal allowed)
  }

  function attachDocumentCardHandlers() {
    resultsEl.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.getAttribute('data-action');
        const docId = btn.getAttribute('data-id');
        if (action === 'details') { await getOpenDetailsModalFor()(docId); return; }
        const card = btn.closest('.doc-card');
        const versionId = card?.getAttribute('data-latest-version-id') || '';
        const fileNameAttr = card?.getAttribute('data-file-name') || `${docId}.bin`;
        if (!versionId) {
          if (action === 'view') window.location.href = `/static/document.html?document_id=${encodeURIComponent(docId)}`;
          else alert('No latest version available for download.');
          return;
        }
        const url = `${apiBase}/documents/versions/${encodeURIComponent(versionId)}/download`;
        if (action === 'view') {
          await handleFileRequest(url, { action: 'view', fallbackNavigate: `/static/document.html?document_id=${encodeURIComponent(docId)}`, fallbackFilename: fileNameAttr });
        } else if (action === 'download') {
          await handleFileRequest(url, { action: 'download', fallbackFilename: fileNameAttr });
        }
      });
    });
  }

  async function fetchSearchDocuments({ title = '', tags = [], uploader = '' } = {}) {
    title = (title || '').trim(); uploader = (uploader || '').trim();
    if (!title && (!Array.isArray(tags) || tags.length === 0) && !uploader) {
      return await fetchAccessibleDocuments();
    }
    const params = new URLSearchParams();
    if (title) params.append('title', title);
    if (uploader) params.append('uploader_name', uploader);
    if (Array.isArray(tags) && tags.length) tags.forEach(t => { const s = (t || '').trim(); if (s) params.append('tags', s); });
    try {
      const res = await searchDocuments(params);
      if (!res || !res.ok) {
        if (res && res.status === 401) return;
        console.warn('search failed', res && res.status);
        if (resultsEl) resultsEl.textContent = 'Search failed'; return;
      }
  let docs = await res.json();
  if (Array.isArray(docs)) docs.sort((a,b)=> (a.document_id||0) - (b.document_id||0));
  await renderDocuments(docs);
    } catch (err) {
      console.error('network error during search', err);
      if (resultsEl) resultsEl.textContent = 'Network error';
    }
  }

  // wire search button once here (module scope)
  btnSearch?.addEventListener('click', async () => {
    const q = document.getElementById('q')?.value ?? '';
    const tagsRaw = document.getElementById('tags')?.value ?? '';
    const uploader = document.getElementById('uploader')?.value ?? '';
    const tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);
    await fetchSearchDocuments({ title: q, tags, uploader });
  });

  return { fetchAccessibleDocuments, fetchSearchDocuments, renderDocuments };
}
