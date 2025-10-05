// Utility helpers shared across modules
import { apiFetch } from './api.js';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}
export function isViewableContentType(ct) {
  if (!ct) return false; const lc = ct.toLowerCase();
  return lc.startsWith('image/') || lc === 'application/pdf' || lc.startsWith('text/');
}
export function extractFilename(disposition, fallback = '') {
  if (!disposition) return fallback;
  const m = disposition.match(/filename="?([^";]+)"?/i);
  return m ? m[1] : fallback;
}
export function forceDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename || 'file.bin';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
export function openInlineOrDownload(blob, contentType, filename) {
  const url = URL.createObjectURL(blob);
  if (isViewableContentType(contentType)) {
    const w = window.open(url, '_blank');
    if (!w) { forceDownload(blob, filename); } else { setTimeout(() => URL.revokeObjectURL(url), 20_000); }
  } else { forceDownload(blob, filename); }
}
export async function handleFileRequest(url, { action = 'view', fallbackNavigate = null, fallbackFilename = 'document.bin' } = {}) {
  try {
    const res = await apiFetch(url);
    if (!res || !res.ok) {
      if (res && res.status === 401) return;
      if (fallbackNavigate) window.location.href = fallbackNavigate; else alert(action === 'download' ? 'Download failed' : 'Cannot view file');
      return;
    }
    const ct = res.headers.get('Content-Type') || '';
    const disposition = res.headers.get('Content-Disposition') || '';
    const filename = extractFilename(disposition, fallbackFilename);
    const blob = await res.blob();
    if (action === 'download') forceDownload(blob, filename); else openInlineOrDownload(blob, ct, filename);
  } catch (err) {
    console.error('handleFileRequest error', err);
    if (fallbackNavigate) window.location.href = fallbackNavigate; else alert('Network error');
  }
}
export function formatBytes(n){ if (n == null) return '—'; if (n < 1024) return n + ' B'; if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB'; return (n/1024/1024).toFixed(2) + ' MB'; }

// Department id normalization helpers
export const normDeptIdFromDept = d => { if (!d) return ''; return String(d.department_id ?? d.id ?? d.departmentId ?? '').trim(); };
export const normDeptIdFromPerm = p => { if (!p) return ''; let raw = p.department_id ?? p.dept_id ?? p.department ?? p.departmentId ?? null; if (raw == null) return ''; if (typeof raw === 'object') { return String(raw.department_id ?? raw.id ?? raw.departmentId ?? '').trim(); } return String(raw).trim(); };
