import { fetchProfile, renderProfile } from './profile.js';
import { setupDocuments } from './documents.js';
import { setupDetails } from './details.js';
import { uploadDocumentFile } from './api.js';

let docs; let details; // populated after DOMContentLoaded

// Upload modal elements
const umEl = document.getElementById('uploadModal');
const btnOpen = document.getElementById('btnOpenUpload');
const btnClose = document.getElementById('btnCloseUpload');
const btnCancel = document.getElementById('btnCancelUpload');

function openUpload(){ if(!umEl) return; umEl.style.display='flex'; umEl.setAttribute('aria-hidden','false'); }
function closeUpload(){ if(!umEl) return; umEl.style.display='none'; umEl.setAttribute('aria-hidden','true'); const st=document.getElementById('uploadStatus'); if(st){ st.style.display='none'; st.textContent=''; } document.getElementById('uploadForm')?.reset(); }
btnOpen?.addEventListener('click', openUpload);
btnClose?.addEventListener('click', closeUpload);
btnCancel?.addEventListener('click', closeUpload);
umEl?.addEventListener('click', e => { if(e.target === umEl) closeUpload(); });

async function handleUpload(form){
  const fileInput=document.getElementById('uploadFile');
  const titleInput=document.getElementById('uploadTitle');
  const publicInput=document.getElementById('uploadPublic');
  const statusEl=document.getElementById('uploadStatus');
  if(!fileInput || fileInput.files.length===0){ if(statusEl){ statusEl.style.display=''; statusEl.textContent='Please choose a file.';} return false; }
  const fd=new FormData(); fd.append('file', fileInput.files[0]);
  if(titleInput && titleInput.value) fd.append('title', titleInput.value);
  if(publicInput && publicInput.checked) fd.append('is_public','true');
  try { const res=await uploadDocumentFile(fd); let txt=''; try{ txt=await res.text(); }catch{} let data=null; try{ data=txt?JSON.parse(txt):null; }catch{} if(!res.ok){ if(statusEl) statusEl.textContent=data?.detail||`Upload failed (${res.status})`; return false; } if(statusEl) statusEl.textContent='Upload succeeded'; form.reset(); return true; } catch(err){ console.error('upload error',err); if(statusEl){ statusEl.style.display=''; statusEl.textContent='Network error during upload'; } return false; }
}

document.getElementById('uploadForm')?.addEventListener('submit', async ev => { ev.preventDefault(); const ok=await handleUpload(ev.currentTarget); if(ok){ await docs.fetchAccessibleDocuments(); closeUpload(); } });

async function init() {
  docs = setupDocuments(() => details.openDetailsModalFor);
  details = setupDetails(async () => { await docs.fetchAccessibleDocuments(); });
  const profile = await fetchProfile();
  if (!profile) return;
  const rendered = renderProfile(profile);
  if (!rendered) return;
  await docs.fetchAccessibleDocuments();

  // wire logout button
  const btnLogout = document.getElementById('btnLogout');
  btnLogout?.addEventListener('click', () => {
    try { localStorage.removeItem('access_token'); } catch (e) {}
    window.location.href = '/static/login.html';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM already ready
  init();
}