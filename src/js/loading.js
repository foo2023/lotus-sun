// ── Loading 遮罩控制（独立模块，避免循环引用） ──
const overlay = document.getElementById('loadingOverlay');

export function showLoading(text = '正在载入…') {
  const p = overlay?.querySelector('.loading-text');
  if (p) p.textContent = text;
  overlay?.classList.remove('hidden');
}

export function hideLoading() {
  overlay?.classList.add('hidden');
}
