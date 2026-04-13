// ── Toast 通知系统 ──
export function showToast(msg, type = 'info', duration = 3000) {
  const icons = { success: '✅', info: 'ℹ️', warn: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration);
}
