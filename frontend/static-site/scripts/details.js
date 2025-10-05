// manages details modal (versions, tags, permissions)
import { apiBase, fetchAllTags, fetchDocumentTags, fetchViewPermissions, grantViewPermission, revokeViewPermission, fetchDepartments, fetchDocument, fetchVersions, updateDocumentVersion, assignTagToDocument, removeTagFromDocument, createTagOnServer, toggleDocumentPublicity, fetchEditPermissions, grantEditPermission, revokeEditPermission, fetchDocumentCapabilities, fetchEligibleEditUsers } from './api.js';
import { escapeHtml, formatBytes, handleFileRequest, normDeptIdFromDept, normDeptIdFromPerm } from './utils.js';

const detailsModal = document.getElementById('detailsModal');
const versionsListEl = document.getElementById('versionsList');
const btnCloseDetails = document.getElementById('btnCloseDetails');
const btnCloseDetailsFooter = document.getElementById('btnCloseDetailsFooter');

// ---------- Helpers ----------
const qs = (sel, root=document) => root.querySelector(sel);
const setHTML = (el, html) => { if(el) el.innerHTML = html; };
const mapJoin = (arr, fn, empty) => (Array.isArray(arr) && arr.length) ? arr.map(fn).join('') : (empty || '');

function openDetailsModal() { if (!detailsModal) return; detailsModal.style.display = 'flex'; detailsModal.setAttribute('aria-hidden', 'false'); }
function closeDetailsModal() { if (!detailsModal) return; detailsModal.style.display = 'none'; detailsModal.setAttribute('aria-hidden', 'true'); if (versionsListEl) versionsListEl.innerHTML = ''; }
btnCloseDetails?.addEventListener('click', closeDetailsModal);
btnCloseDetailsFooter?.addEventListener('click', closeDetailsModal);
detailsModal?.addEventListener('click', (e) => { if (e.target === detailsModal) closeDetailsModal(); });

function renderVersionEntries(versions, documentId) {
  return mapJoin(versions, v => {
    const verId = escapeHtml(v.version_id ?? '');
    const verNum = escapeHtml(v.version_number ?? '');
    const title = escapeHtml(v.title ?? v.file_name ?? 'Untitled');
    const uploader = escapeHtml(v.uploader_name ?? v.uploader_id ?? '—');
    const uploaded = v.upload_date ? new Date(v.upload_date).toLocaleString() : '—';
    const size = formatBytes(v.file_size ?? v.file_size_bytes ?? null);
    const fname = escapeHtml(v.file_name ?? '');
    return `<div style="padding:10px;border-bottom:1px solid #eee">
      <div style="font-weight:600">${title} <span style="color:#666;font-weight:400">(#${verNum})</span></div>
      <div style="font-size:0.8rem;color:#555;margin-top:4px">File: ${fname || '—'} • ${size}</div>
      <div style="font-size:0.9rem;color:#666;margin-top:4px">Uploader: ${uploader} • ${uploaded}</div>
      <div style="margin-top:8px">
        <button class="btn" data-action="vview" data-id="${verId}" data-fname="${fname}">View</button>
        <button class="btn secondary" data-action="vdownload" data-id="${verId}" data-fname="${fname}">Download</button>
      </div>
    </div>`;
  }, '');
}

export function setupDetails(refreshDocuments) {
  async function openDetailsModalFor(documentId) {
    if (!versionsListEl) return; versionsListEl.innerHTML = '<div style="padding:12px;color:#666">Loading versions…</div>'; openDetailsModal();
    try {
      // Step 1: fetch read-only data + capabilities first (no permission lists yet)
      const [versions, docTags, caps, allTags] = await Promise.all([
        fetchVersions(documentId),
        fetchDocumentTags(documentId),
        fetchDocumentCapabilities(documentId),
        fetchAllTags()
      ]);
    // Fetch current user for gating
    let currentUser = null;
    try {
      const meRes = await fetch(`${apiBase}/auth/me`, { headers: { ...((localStorage.getItem('access_token')) ? { 'Authorization':'Bearer '+localStorage.getItem('access_token')} : {}) } });
      if (meRes?.ok) currentUser = await meRes.json();
    } catch {}
    let departments = await fetchDepartments();
    let docDetail = await fetchDocument(documentId);
  const ownerDeptIdRaw = docDetail ? (docDetail.department_id ?? docDetail.department?.department_id ?? null) : null;
      const ownerDeptId = ownerDeptIdRaw != null ? String(ownerDeptIdRaw).trim() : '';
  const canEdit = !!(caps?.can_edit);

      // Step 2: If user can edit, fetch permission lists in parallel. Otherwise keep them empty (not rendered)
      let viewPerms = [];
      let editPerms = [];
      if (canEdit) {
        try {
          [viewPerms, editPerms] = await Promise.all([
            fetchViewPermissions(documentId),
            fetchEditPermissions(documentId)
          ]);
        } catch (permErr) { console.debug('permission lists fetch error', permErr); }
      }

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
      function renderEditPermItem(p) {
        const userId = p.user_id ?? p.user ?? '';
        const fullName = (p.first_name && p.last_name) ? `${p.first_name} ${p.last_name}` : (p.username || `User ${userId}`);
        return `<div class="edit-perm-item" data-user-id="${userId}" style="display:flex;align-items:center;gap:8px;margin:6px 0">
          <div style="flex:1">${escapeHtml(fullName)} <span style="color:#999;font-size:11px">(id:${escapeHtml(String(userId))})</span></div>
          <button class="btn secondary revoke-edit" data-user-id="${userId}">Revoke</button>
        </div>`;
      }

      // Build static (always visible) sections first
      console.log('[details] capabilities response', caps, 'canEdit=', canEdit);
      let html = `
        <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-weight:600;margin-bottom:6px">Publicity</div>
            <div id="publicityStatus" style="color:#666">${docDetail && docDetail.is_public ? 'Public' : 'Private'}</div>
          </div>
          ${canEdit ? `<div><button id="btnTogglePublicity" class="btn primary">${docDetail && docDetail.is_public ? 'Make Private' : 'Make Public'}</button></div>`: ''}
        </div>`;

      if (!canEdit) {
        // Read-only block
        html += `
        <div style="padding:10px;border:1px solid #eee;border-radius:6px;background:#fafafa;margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px">
            <span>Read-only view</span>
            <span style="font-size:11px;background:#999;color:#fff;padding:2px 6px;border-radius:4px;letter-spacing:.5px">NO EDIT ACCESS</span>
          </div>
          <div style="font-size:0.9rem;color:#555">You can view versions and assigned tags but not modify this document.</div>
        </div>
        <div style="margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:6px">Tags</div>
          <div id="assignedTagsArea">${assigned.length ? assigned.map(t => `<span class=\"tag\">${escapeHtml(t.tag_name)}</span>`).join(' ') : '<span class=\"tag muted\">no tags</span>'}</div>
        </div>`;
      } else {
        // Editable tag UI
        html += `
        <div style="display:flex;gap:16px;margin-bottom:12px;align-items:flex-start">
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:6px">Assigned tags</div>
            <div id="assignedTagsArea">${assigned.length ? assigned.map(t => renderTagBtn(t, true)).join(' ') : '<span class=\"tag muted\">no tags</span>'}</div>
          </div>
          <div style="flex:1">
            <div style="font-weight:600;margin-bottom:6px">Available tags</div>
            <div id="availableTagsArea">${available.length ? available.map(t => renderTagBtn(t, false)).join(' ') : '<span style=\\"color:#666\\">No tags available</span>'}</div>
          </div>
        </div>`;
      }

      if (canEdit) {
        html += `
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
          <input id="newTagInput" placeholder="Create & assign tag" style="flex:1;padding:8px;border-radius:6px;border:1px solid #ddd" />
          <button id="btnCreateAssignTag" class="btn">Create & Assign</button>
        </div>`;
      }

      if (canEdit) {
        html += `
        <div style="margin-top:12px;margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:6px">View permissions (departments)</div>
          <div id="viewPermsArea">${Array.isArray(viewPerms) && viewPerms.length ? viewPerms.map(p => renderViewPermItem(p)).join('') : '<div style=\"color:#666\">No explicit view permissions</div>'}</div>
          <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
            <select id="vpDeptSelect" style="padding:6px;border-radius:6px;border:1px solid #ddd;width:240px">
              <option value="">Select department…</option>
            </select>
            <button id="btnGrantView" class="btn">Grant view to department</button>
          </div>
        </div>`;
      }

      if (canEdit) {
        html += `
        <div style="margin-top:12px;margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:6px">Edit permissions (users)</div>
          <div id="editPermsArea">${Array.isArray(editPerms) && editPerms.length ? editPerms.map(p => renderEditPermItem(p)).join('') : '<div style=\"color:#666\">No edit permissions</div>'}</div>
          <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
            <select id="epUserSelect" style="padding:6px;border-radius:6px;border:1px solid #ddd;min-width:220px"><option value="">Select user…</option></select>
            <button id="btnGrantEdit" class="btn">Grant edit</button>
          </div>
        </div>`;
      }

      // (Older duplicate edit permissions block removed; new one with eligible dropdown added earlier.)

      if (canEdit) {
        html += `
        <div style="margin-top:12px;border-top:1px solid #eee;padding-top:12px">
          <div style="font-weight:600;margin-bottom:6px">Add new version</div>
          <form id="addVersionForm" style="display:flex;gap:8px;align-items:center">
            <input id="newVersionTitle" placeholder="version title (optional)" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ddd" />
            <input id="newVersionFile" type="file" style="flex:1" />
            <button id="btnAddVersion" class="btn" type="button">Upload Version</button>
          </form>
          <div id="addVersionStatus" style="margin-top:8px;color:#666;display:none"></div>
        </div>`;
      }

      html += `<div id="versionsInner">${renderVersionEntries(versions, documentId)}</div>`;

      versionsListEl.innerHTML = html;
      if (!canEdit) {
        // Defensive: remove any stray edit-only nodes if old HTML cached
        [ '#btnCreateAssignTag', '#vpDeptSelect', '#btnGrantView', '#epUserIdInput', '#btnGrantEdit', '#addVersionForm', '#btnAddVersion' ].forEach(sel => { const el = qs(sel); if (el) el.remove(); });
      }
      const updateVersionsInner = (updated) => setHTML(qs('#versionsInner'), renderVersionEntries(updated, documentId));

    const vpSelect = qs('#vpDeptSelect');
    const publicityEl = qs('#publicityStatus');
    const publicityBtn = qs('#btnTogglePublicity');
      async function refreshCoreSections({ refreshPerms = false } = {}) {
        // Fetch latest versions & tags always; permissions optionally (only when needed)
        const basePromises = [ fetchVersions(documentId), fetchDocumentTags(documentId) ];
        let permPromises = [];
        if (refreshPerms && canEdit) {
          permPromises = [ fetchViewPermissions(documentId), fetchEditPermissions(documentId) ];
        }
        const docPromise = fetchDocument(documentId);
        const [newVersions, newDocTags, maybeViewPerms, maybeEditPerms, newDocDetail] = await Promise.all([
          ...basePromises,
          ...(refreshPerms && canEdit ? permPromises : []),
          docPromise
        ]);
        // Update doc state
        docDetail.is_public = newDocDetail?.is_public ?? docDetail.is_public;
        updateVersionsInner(Array.isArray(newVersions) ? newVersions : []);
        updateTagAreas(newDocTags || [], (allTags || []).filter(t => !(newDocTags || []).some(nt => String(nt.tag_id) === String(t.tag_id))));
        if (refreshPerms && canEdit) {
          if (Array.isArray(maybeViewPerms)) setHTML(qs('#viewPermsArea'), maybeViewPerms.length ? maybeViewPerms.map(p => renderViewPermItem(p)).join('') : '<div style="color:#666">No explicit view permissions</div>');
          if (Array.isArray(maybeEditPerms)) setHTML(qs('#editPermsArea'), maybeEditPerms.length ? maybeEditPerms.map(p => renderEditPermItem(p)).join('') : '<div style="color:#666">No edit permissions</div>');
        }
        if (publicityEl) publicityEl.textContent = docDetail.is_public ? 'Public' : 'Private';
        if (publicityBtn) publicityBtn.textContent = docDetail.is_public ? 'Make Private' : 'Make Public';
        await refreshDocuments();
      }

      if (publicityBtn) {
        publicityBtn.addEventListener('click', async () => {
          try {
            publicityBtn.disabled = true;
            await toggleDocumentPublicity(documentId);
            await refreshCoreSections({ refreshPerms: true });
          } catch (e) {
            alert('Could not change publicity: ' + (e.message || 'error'));
          } finally { publicityBtn.disabled = false; }
        });
      }
      function populateDeptSelect(departmentsList, currentViewPerms, ownerDeptStr) {
        if (!vpSelect) return;
        vpSelect.innerHTML = '<option value="">Select department…</option>';
        const granted = new Set((currentViewPerms || []).map(p => normDeptIdFromPerm(p)).filter(Boolean));
        const ownerNormalized = ownerDeptStr ? String(ownerDeptStr).trim() : '';
        if (ownerNormalized) granted.add(ownerNormalized);
        (departmentsList || []).forEach(d => {
          const id = normDeptIdFromDept(d);
          if(!id || (ownerNormalized && String(id) === ownerNormalized) || granted.has(id)) return;
          const opt = document.createElement('option'); opt.value = id; opt.textContent = d.name ?? (`Dept ${id}`); vpSelect.appendChild(opt);
        });
      }
      populateDeptSelect(departments, viewPerms, ownerDeptId);

      // Version upload
      qs('#btnAddVersion')?.addEventListener('click', async () => {
        const addStatus = qs('#addVersionStatus'); if(!addStatus) return;
        const fileEl = qs('#newVersionFile'); const titleEl = qs('#newVersionTitle');
        const file = fileEl?.files?.[0]; if(!file){ addStatus.style.display=''; addStatus.textContent='Please choose a file.'; return; }
        const fd = new FormData(); fd.append('file', file); if(titleEl?.value) fd.append('title', titleEl.value);
        try {
          addStatus.style.display=''; addStatus.textContent='Uploading...';
            const res = await updateDocumentVersion(documentId, fd);
            if(!res || !res.ok){ const txt = await res?.text?.().catch(()=> ''); addStatus.textContent = txt || `Upload failed (${res? res.status:'network'})`; return; }
            addStatus.textContent='Version uploaded.';
            await refreshCoreSections();
        } catch(e){ console.error('add version error', e); addStatus.textContent='Network error while uploading version'; }
      });

      // Grant view permission
  const btnGrant = qs('#btnGrantView');
  if (btnGrant) {
        btnGrant.onclick = async () => {
          const sel = document.getElementById('vpDeptSelect');
          const target = sel ? (sel.value || '').trim() : '';
          if (!target) return alert('Select a department');
          const deptId = Number(target); if (Number.isNaN(deptId)) return alert('Department id must be a number');
          try {
            await grantViewPermission(documentId, { dept_id: deptId });
            const updatedViewPerms = await fetchViewPermissions(documentId);
            setHTML(qs('#viewPermsArea'), updatedViewPerms.length ? updatedViewPerms.map(p => renderViewPermItem(p)).join('') : '<div style="color:#666">No explicit view permissions</div>');
            departments = await fetchDepartments();
            populateDeptSelect(departments, updatedViewPerms, ownerDeptId);
            // Refresh document detail so publicity state updates immediately in the modal
            try {
              const refreshedDoc = await fetchDocument(documentId);
              if (refreshedDoc) {
                docDetail = refreshedDoc;
                if (publicityEl) publicityEl.textContent = docDetail.is_public ? 'Public' : 'Private';
                if (publicityBtn) publicityBtn.textContent = docDetail.is_public ? 'Make Private' : 'Make Public';
              }
            } catch (innerErr) {
              console.debug('could not refresh document after grant', innerErr);
            }
            await refreshDocuments();
          } catch (e) { alert('Could not grant view permission: ' + (e.message || 'error')); }
        };
      }

      // Revoke view permissions
  const viewPermsArea = qs('#viewPermsArea');
      if (viewPermsArea) {
        viewPermsArea.onclick = async (ev) => {
          const btn = ev.target.closest('button.revoke-view'); if (!btn) return;
          const dept_id = btn.getAttribute('data-dept-id') || null; if (!dept_id) return alert('No department id on this permission');
          btn.disabled = true; try {
            const ok = await revokeViewPermission(documentId, { dept_id: dept_id ? Number(dept_id) : null });
            if (!ok) throw new Error('revoke failed');
            const updatedViewPerms = await fetchViewPermissions(documentId);
            setHTML(viewPermsArea, updatedViewPerms.length ? updatedViewPerms.map(p => renderViewPermItem(p)).join('') : '<div style="color:#666">No explicit view permissions</div>');
            departments = await fetchDepartments();
            populateDeptSelect(departments, updatedViewPerms, ownerDeptId);
            await refreshDocuments();
          } catch { alert('Could not revoke view permission'); } finally { btn.disabled = false; }
        };
      }

      // Grant edit permission
      const btnGrantEdit = qs('#btnGrantEdit');
  if (btnGrantEdit) {
        const userSelect = qs('#epUserSelect');
        // populate eligible users dropdown
        try {
          const eligible = await fetchEligibleEditUsers(documentId);
          if (userSelect && Array.isArray(eligible)) {
            eligible.forEach(u => {
              const opt = document.createElement('option');
              opt.value = u.user_id;
              const name = (u.first_name && u.last_name) ? `${u.first_name} ${u.last_name}` : u.username;
              opt.textContent = `${name} (id:${u.user_id})`;
              userSelect.appendChild(opt);
            });
          }
        } catch(e){ console.debug('eligible users fetch failed', e); }

        btnGrantEdit.onclick = async () => {
          const selVal = userSelect ? (userSelect.value||'').trim() : '';
          if (!selVal) return alert('Select a user');
          const userId = Number(selVal); if (Number.isNaN(userId)) return alert('Invalid user');
          try {
            await grantEditPermission(documentId, { user_id: userId });
            const updatedEditPerms = await fetchEditPermissions(documentId);
            setHTML(qs('#editPermsArea'), updatedEditPerms.length ? updatedEditPerms.map(p => renderEditPermItem(p)).join('') : '<div style="color:#666">No edit permissions</div>');
            // remove granted user from dropdown
            if (userSelect) {
              [...userSelect.options].forEach(o => { if (String(o.value) === String(userId)) o.remove(); });
              userSelect.value='';
            }
            await refreshDocuments();
          } catch (e) { alert('Could not grant edit permission: ' + (e.message || 'error')); }
        };
      }

      // Revoke edit permissions
      const editPermsArea = qs('#editPermsArea');
      if (editPermsArea) {
        editPermsArea.onclick = async (ev) => {
          const btn = ev.target.closest('button.revoke-edit'); if (!btn) return;
          const userIdAttr = btn.getAttribute('data-user-id'); if (!userIdAttr) return alert('No user id on this permission');
          const userId = Number(userIdAttr);
          btn.disabled = true;
          try {
            const ok = await revokeEditPermission(documentId, { user_id: userId });
            if (!ok) throw new Error('revoke failed');
            const updatedEditPerms = await fetchEditPermissions(documentId);
            setHTML(editPermsArea, updatedEditPerms.length ? updatedEditPerms.map(p => renderEditPermItem(p)).join('') : '<div style="color:#666">No edit permissions</div>');
            // repopulate eligible users list (add the revoked one back)
            const userSelect = qs('#epUserSelect');
            if (userSelect) {
              // Clear and rebuild
              userSelect.innerHTML = '<option value="">Select user…</option>';
              try {
                const eligible = await fetchEligibleEditUsers(documentId);
                eligible.forEach(u => {
                  const opt = document.createElement('option');
                  opt.value = u.user_id;
                  const name = (u.first_name && u.last_name) ? `${u.first_name} ${u.last_name}` : u.username;
                  opt.textContent = `${name} (id:${u.user_id})`;
                  userSelect.appendChild(opt);
                });
              } catch(e){ console.debug('eligible refresh failed', e); }
            }
            await refreshDocuments();
          } catch { alert('Could not revoke edit permission'); } finally { btn.disabled = false; }
        };
      }

      function updateTagAreas(newAssigned, newAvailable) {
        setHTML(qs('#assignedTagsArea'), newAssigned.length ? newAssigned.map(t => renderTagBtn(t, true)).join(' ') : '<span class="tag muted">no tags</span>');
        setHTML(qs('#availableTagsArea'), newAvailable.length ? newAvailable.map(t => renderTagBtn(t, false)).join(' ') : '<span style="color:#666">No tags available</span>');
      }

      qs('#btnCreateAssignTag')?.addEventListener('click', async () => {
        const input = qs('#newTagInput'); const val=(input?.value||'').trim(); if(!val) return;
        try { const created = await createTagOnServer(val); if(!await assignTagToDocument(documentId, created.tag_id)) throw new Error('assign failed'); assigned.unshift(created); updateTagAreas(assigned, available); await refreshDocuments(); input.value=''; }
        catch(e){ alert('Could not create/assign tag: '+ (e.message||'error')); }
      });

      if (canEdit) {
        qs('#availableTagsArea')?.addEventListener('click', async ev => {
          const btn = ev.target.closest('button.tag-ctl'); if(!btn) return; const tagId = btn.getAttribute('data-tag-id'); btn.disabled=true;
          try { if(!await assignTagToDocument(documentId, tagId)) throw new Error('assign failed'); const idx=available.findIndex(t=> String(t.tag_id)===String(tagId)); if(idx>=0){ const moved=available.splice(idx,1)[0]; assigned.unshift(moved);} updateTagAreas(assigned, available); await refreshDocuments(); }
          catch{ alert('Could not assign tag'); } finally { btn.disabled=false; }
        });

        qs('#assignedTagsArea')?.addEventListener('click', async ev => {
          const btn = ev.target.closest('button.tag-ctl'); if(!btn) return; const tagId=btn.getAttribute('data-tag-id'); btn.disabled=true;
          try { if(!await removeTagFromDocument(documentId, tagId)) throw new Error('remove failed'); const idx=assigned.findIndex(t=> String(t.tag_id)===String(tagId)); if(idx>=0){ const moved=assigned.splice(idx,1)[0]; available.unshift(moved);} updateTagAreas(assigned, available); await refreshDocuments(); }
          catch{ alert('Could not remove tag'); } finally { btn.disabled=false; }
        });
      }

      qs('#versionsInner')?.querySelectorAll('button[data-action]')?.forEach(b => {
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
