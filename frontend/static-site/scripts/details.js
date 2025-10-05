// manages details modal (versions, tags, permissions)
import { apiBase, fetchAllTags, fetchDocumentTags, fetchViewPermissions, grantViewPermission, revokeViewPermission, fetchDepartments, fetchDocument, fetchVersions, updateDocumentVersion, assignTagToDocument, removeTagFromDocument, createTagOnServer } from './api.js';
import { escapeHtml, formatBytes, handleFileRequest, normDeptIdFromDept, normDeptIdFromPerm } from './utils.js';

const detailsModal = document.getElementById('detailsModal');
const versionsListEl = document.getElementById('versionsList');
const btnCloseDetails = document.getElementById('btnCloseDetails');
const btnCloseDetailsFooter = document.getElementById('btnCloseDetailsFooter');

function openDetailsModal() { if (!detailsModal) return; detailsModal.style.display = 'flex'; detailsModal.setAttribute('aria-hidden', 'false'); }
function closeDetailsModal() { if (!detailsModal) return; detailsModal.style.display = 'none'; detailsModal.setAttribute('aria-hidden', 'true'); if (versionsListEl) versionsListEl.innerHTML = ''; }
btnCloseDetails?.addEventListener('click', closeDetailsModal);
btnCloseDetailsFooter?.addEventListener('click', closeDetailsModal);
detailsModal?.addEventListener('click', (e) => { if (e.target === detailsModal) closeDetailsModal(); });

function renderVersionEntries(versions, documentId) {
  return (versions || []).map(v => {
    const verId = escapeHtml(v.version_id ?? '');
    const verNum = escapeHtml(v.version_number ?? '');
    const title = escapeHtml(v.title ?? v.file_name ?? 'Untitled');
    const uploader = escapeHtml(v.uploader_name ?? v.uploader_id ?? '—');
    const uploaded = v.upload_date ? new Date(v.upload_date).toLocaleString() : '—';
    const size = formatBytes(v.file_size ?? v.file_size_bytes ?? null);
    const fname = escapeHtml(v.file_name ?? '');
    return `<div style="padding:10px;border-bottom:1px solid #eee">
      <div style="font-weight:600">${title} <span style="color:#666;font-weight:400">(#${verNum})</span></div>
      <div style="font-size:0.9rem;color:#666;margin-top:6px">Uploader: ${uploader} • ${uploaded} • ${size}</div>
      <div style="margin-top:8px">
        <button class="btn" data-action="vview" data-id="${verId}" data-fname="${fname}">View</button>
        <button class="btn secondary" data-action="vdownload" data-id="${verId}" data-fname="${fname}">Download</button>
      </div>
    </div>`;
  }).join('');
}

export function setupDetails(refreshDocuments) {
  async function openDetailsModalFor(documentId) {
    if (!versionsListEl) return; versionsListEl.innerHTML = '<div style="padding:12px;color:#666">Loading versions…</div>'; openDetailsModal();
    try {
      const [versions, docTags] = await Promise.all([
        fetchVersions(documentId),
        fetchDocumentTags(documentId)
      ]);
      const allTags = await fetchAllTags();
      const viewPerms = await fetchViewPermissions(documentId);
      let departments = await fetchDepartments();
      const docDetail = await fetchDocument(documentId);
      const ownerDeptIdRaw = docDetail ? (docDetail.department_id ?? docDetail.department?.department_id ?? null) : null;
      const ownerDeptId = ownerDeptIdRaw != null ? String(ownerDeptIdRaw).trim() : '';

      const deptMap = new Map((departments || []).map(d => [normDeptIdFromDept(d), d.name ?? '']));
      const assigned = (docTags || []).slice();
      const assignedById = new Map((docTags || []).map(t => [String(t.tag_id), t]));
      const available = (allTags || []).filter(t => !assignedById.has(String(t.tag_id)));

      function renderTagBtn(t, assignedFlag) { return `<button class="tag-ctl" data-tag-id="${t.tag_id}" data-assigned="${assignedFlag ? '1':'0'}" style="margin:4px;padding:6px 8px;border-radius:999px;border:1px solid #e6e9ee;background:${assignedFlag ? '#eef2ff' : '#fff'}">${escapeHtml(t.tag_name)}</button>`; }
      function renderViewPermItem(p) {
        const id = p.view_permission_id ?? p.permission_id ?? '';
        const deptId = p.department_id ?? null;
        const label = deptId ? (deptMap.get(String(deptId)) || `Dept ${deptId}`) : 'Unknown';
        return `<div class="view-perm-item" data-perm-id="${id}" style="display:flex;align-items:center;gap:8px;margin:6px 0">
          <div style="flex:1">${escapeHtml(label)}</div>
          <button class="btn secondary revoke-view" data-dept-id="${deptId ?? ''}">Revoke</button>
        </div>`;
      }

      versionsListEl.innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:12px;align-items:flex-start">
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:6px">Assigned tags</div>
            <div id="assignedTagsArea">${assigned.length ? assigned.map(t => renderTagBtn(t, true)).join(' ') : '<span class="tag muted">no tags</span>'}</div>
          </div>
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:6px">Available tags</div>
            <div id="availableTagsArea">${available.length ? available.map(t => renderTagBtn(t, false)).join(' ') : '<span style=\"color:#666\">No tags available</span>'}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
          <input id="newTagInput" placeholder="Create & assign tag" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd" />
          <button id="btnCreateAssignTag" class="btn">Create & Assign</button>
        </div>
        <div style="margin-top:12px;margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:6px">View permissions (departments)</div>
          <div id="viewPermsArea">${Array.isArray(viewPerms) && viewPerms.length ? viewPerms.map(p => renderViewPermItem(p)).join('') : '<div style="color:#666">No explicit view permissions</div>'}</div>
          <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
            <select id="vpDeptSelect" style="padding:6px;border-radius:6px;border:1px solid #ddd;width:240px">
              <option value="">Select department…</option>
            </select>
            <button id="btnGrantView" class="btn">Grant view to department</button>
          </div>
        </div>
        <div style="margin-top:12px;border-top:1px solid #eee;padding-top:12px">
          <div style="font-weight:600;margin-bottom:6px">Add new version</div>
          <form id="addVersionForm" style="display:flex;gap:8px;align-items:center">
            <input id="newVersionTitle" placeholder="version title (optional)" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd" />
            <input id="newVersionFile" type="file" style="flex:1" />
            <button id="btnAddVersion" class="btn" type="button">Upload Version</button>
          </form>
          <div id="addVersionStatus" style="margin-top:8px;color:#666;display:none"></div>
        </div>
        <div id="versionsInner">${renderVersionEntries(versions, documentId)}</div>
      `;

      function updateVersionsInner(updated) {
        const inner = document.getElementById('versionsInner');
        if (inner) inner.innerHTML = renderVersionEntries(updated, documentId);
      }

      const vpSelect = document.getElementById('vpDeptSelect');
      function populateDeptSelect(departmentsList, currentViewPerms, ownerDeptStr) {
        if (!vpSelect) return;
        vpSelect.innerHTML = '<option value="">Select department…</option>';
        const granted = new Set((currentViewPerms || []).map(p => normDeptIdFromPerm(p)).filter(Boolean));
        const ownerNormalized = ownerDeptStr ? String(ownerDeptStr).trim() : '';
        if (ownerNormalized) granted.add(ownerNormalized);
        (departmentsList || []).forEach(d => {
          const id = normDeptIdFromDept(d); if (!id) return; if (ownerNormalized && String(id) === ownerNormalized) return; if (granted.has(id)) return;
          const opt = document.createElement('option'); opt.value = id; opt.textContent = d.name ?? (`Dept ${id}`); vpSelect.appendChild(opt);
        });
      }
      populateDeptSelect(departments, viewPerms, ownerDeptId);

      // Version upload
      document.getElementById('btnAddVersion')?.addEventListener('click', async () => {
        const addStatus = document.getElementById('addVersionStatus');
        if (!addStatus) return; const fileEl = document.getElementById('newVersionFile'); const titleEl = document.getElementById('newVersionTitle');
        const file = fileEl?.files?.[0]; if (!file) { addStatus.style.display=''; addStatus.textContent='Please choose a file.'; return; }
        const fd = new FormData(); fd.append('file', file); if (titleEl && titleEl.value) fd.append('title', titleEl.value);
        try {
          addStatus.style.display=''; addStatus.textContent='Uploading...';
          const res = await updateDocumentVersion(documentId, fd);
          if (!res || !res.ok) { const txt = await res.text().catch(()=> ''); addStatus.textContent = txt || `Upload failed (${res ? res.status : 'network'})`; return; }
          addStatus.textContent = 'Version uploaded.';
          const updated = await fetchVersions(documentId);
          updateVersionsInner(Array.isArray(updated) ? updated : []);
          await refreshDocuments();
        } catch (err) { console.error('add version error', err); addStatus.textContent = 'Network error while uploading version'; }
      });

      // Grant view permission
      const btnGrant = document.getElementById('btnGrantView');
      if (btnGrant) {
        btnGrant.onclick = async () => {
          const sel = document.getElementById('vpDeptSelect');
          const target = sel ? (sel.value || '').trim() : '';
          if (!target) return alert('Select a department');
          const deptId = Number(target); if (Number.isNaN(deptId)) return alert('Department id must be a number');
          try {
            await grantViewPermission(documentId, { dept_id: deptId });
            const updated = await fetchViewPermissions(documentId);
            document.getElementById('viewPermsArea').innerHTML = updated.length ? updated.map(p => renderViewPermItem(p)).join('') : '<div style="color:#666">No explicit view permissions</div>';
            departments = await fetchDepartments();
            populateDeptSelect(departments, updated, ownerDeptId);
            await refreshDocuments();
          } catch (e) { alert('Could not grant view permission: ' + (e.message || 'error')); }
        };
      }

      // Revoke view permissions
      const viewPermsArea = document.getElementById('viewPermsArea');
      if (viewPermsArea) {
        viewPermsArea.onclick = async (ev) => {
          const btn = ev.target.closest('button.revoke-view'); if (!btn) return;
          const dept_id = btn.getAttribute('data-dept-id') || null; if (!dept_id) return alert('No department id on this permission');
          btn.disabled = true; try {
            const ok = await revokeViewPermission(documentId, { dept_id: dept_id ? Number(dept_id) : null });
            if (!ok) throw new Error('revoke failed');
            const updated = await fetchViewPermissions(documentId);
            viewPermsArea.innerHTML = updated.length ? updated.map(p => renderViewPermItem(p)).join('') : '<div style="color:#666">No explicit view permissions</div>';
            departments = await fetchDepartments();
            populateDeptSelect(departments, updated, ownerDeptId);
            await refreshDocuments();
          } catch { alert('Could not revoke view permission'); } finally { btn.disabled = false; }
        };
      }

      function updateTagAreas(newAssigned, newAvailable) {
        const at = document.getElementById('assignedTagsArea'); const av = document.getElementById('availableTagsArea');
        if (at) at.innerHTML = newAssigned.length ? newAssigned.map(t => renderTagBtn(t, true)).join(' ') : '<span class="tag muted">no tags</span>';
        if (av) av.innerHTML = newAvailable.length ? newAvailable.map(t => renderTagBtn(t, false)).join(' ') : '<span style=\"color:#666\">No tags available</span>';
      }

      document.getElementById('btnCreateAssignTag')?.addEventListener('click', async () => {
        const input = document.getElementById('newTagInput'); const val = (input?.value || '').trim(); if (!val) return;
        try {
          const created = await createTagOnServer(val);
            const okAssign = await assignTagToDocument(documentId, created.tag_id);
            if (!okAssign) throw new Error('assign failed');
            assigned.unshift(created);
            updateTagAreas(assigned, available);
            await refreshDocuments();
            input.value = '';
        } catch (e) { alert('Could not create/assign tag: ' + (e.message || 'error')); }
      });

      document.getElementById('availableTagsArea')?.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button.tag-ctl'); if (!btn) return;
        const tagId = btn.getAttribute('data-tag-id'); btn.disabled = true;
        try {
          const ok = await assignTagToDocument(documentId, tagId); if (!ok) throw new Error('assign failed');
          const idx = available.findIndex(t => String(t.tag_id) === String(tagId));
          if (idx >= 0) { const moved = available.splice(idx,1)[0]; assigned.unshift(moved); }
          updateTagAreas(assigned, available); await refreshDocuments();
        } catch { alert('Could not assign tag'); } finally { btn.disabled = false; }
      });

      document.getElementById('assignedTagsArea')?.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button.tag-ctl'); if (!btn) return; const tagId = btn.getAttribute('data-tag-id'); btn.disabled = true;
        try {
          const ok = await removeTagFromDocument(documentId, tagId); if (!ok) throw new Error('remove failed');
          const idx = assigned.findIndex(t => String(t.tag_id) === String(tagId)); if (idx >= 0) { const moved = assigned.splice(idx,1)[0]; available.unshift(moved); }
          updateTagAreas(assigned, available); await refreshDocuments();
        } catch { alert('Could not remove tag'); } finally { btn.disabled = false; }
      });

      document.getElementById('versionsInner')?.querySelectorAll('button[data-action]')?.forEach(b => {
        b.addEventListener('click', async () => {
          const a = b.getAttribute('data-action');
          const vid = b.getAttribute('data-id');
          const fname = b.getAttribute('data-fname') || `${documentId}.bin`;
          const url = `${apiBase}/documents/versions/${encodeURIComponent(vid)}/download`;
          if (a === 'vdownload') await handleFileRequest(url, { action: 'download', fallbackFilename: fname });
          else if (a === 'vview') await handleFileRequest(url, { action: 'view', fallbackFilename: fname });
        });
      });
    } catch (err) {
      console.error('versions fetch error', err);
      versionsListEl.innerHTML = '<div style="padding:12px;color:#c00">Network error loading versions.</div>';
    }
  }
  return { openDetailsModalFor, closeDetailsModal };
}
