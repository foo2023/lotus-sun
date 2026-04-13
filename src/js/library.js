import { state } from './state.js';
import { getTauriAPI, formatTime, formatBytes, getThumbnail, getFileSize, normalizePath } from './utils.js';
import { showPage } from './router.js';
import { showToast } from './toast.js';
import { saveToStorage, clearAllStorage } from './storage.js';
import { startWatching } from './watcher.js';
import { showLoading, hideLoading } from './loading.js';

// ── 显示资料库页面 ──
export function showLibrary() {
  document.getElementById('displayPath').textContent = state.folderPath || '未知路径';
  renderGrid(state.videos);
  updateStats();
  showPage('page-library');
}

// ── 更新统计数字 ──
export function updateStats() {
  const total = state.videos.length;
  const watched = state.videos.filter(v => (state.progress[v.path]?.currentTime ?? 0) > 2).length;
  document.getElementById('totalCount').textContent = total;
  document.getElementById('watchedCount').textContent = watched;
}

// ── 渲染影片格子 ──
export function renderGrid(videos) {
  const grid = document.getElementById('videoGrid');
  grid.innerHTML = '';

  if (!videos.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎞️</div>
        <p>没有找到符合条件的影片<br/>请尝试其他搜索关键字或重新选择资料夹</p>
      </div>`;
    return;
  }

  videos.forEach(v => {
    const prog = state.progress[v.path];
    // duration が 0 でも currentTime があれば badge を表示する
    // pct は duration が判明している場合のみ計算
    const hasProg = prog && prog.currentTime > 2;
    const pct = (hasProg && prog.duration > 0)
      ? Math.min(100, (prog.currentTime / prog.duration) * 100)
      : 0;

    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <div class="card-thumb" style="
        background-image: url('${v.thumbnail}');
        background-size: cover;
        background-position: center;
      ">
        <div class="play-overlay">▶</div>
        ${hasProg ? `
          ${pct > 0 ? `<div class="card-progress-bar" style="width:${pct.toFixed(1)}%"></div>` : ''}
          <div class="badge-resume">▶ ${formatTime(prog.currentTime)}</div>
        ` : ''}
      </div>
      <div class="card-body">
        <div class="card-name" title="${v.name}">${v.name.replace(/\.mp4$/i, '')}</div>
        <div class="card-meta">
          <span>🎬 MP4</span>
          ${v.size ? `<span class="dot"></span><span>${formatBytes(v.size)}</span>` : ''}
          ${hasProg && pct > 0 ? `<span class="dot"></span><span style="color:var(--accent2)">${pct.toFixed(0)}%</span>` : ''}
        </div>
      </div>`;

    card.addEventListener('click', async () => {
      const { openVideo } = await import('./player.js');
      openVideo(v);
    });
    grid.appendChild(card);
  });
}

// ── 初始化资料库页面事件 ──
export function initLibraryEvents() {
  // 搜索过滤
  document.getElementById('searchInput').addEventListener('input', function () {
    const q = this.value.trim().toLowerCase();
    const filtered = q
      ? state.videos.filter(v => v.name.toLowerCase().includes(q))
      : state.videos;
    renderGrid(filtered);
  });

  // 重新选择资料夹（保留进度）
  document.getElementById('btnRefresh').addEventListener('click', async () => {
    const tauri = getTauriAPI();
    if (!tauri) return;

    try {
      const selectedPath = await tauri.dialog.open({
        directory: true,
        multiple: false,
        title: '重新选择影片资料夹',
        defaultPath: state.folderPath || undefined,
      });

      if (!selectedPath) return;

      showLoading('正在扫描影片…');

      const entries = await tauri.fs.readDir(selectedPath);
      const mp4Entries = entries.filter(e =>
        e.name && e.name.toLowerCase().endsWith('.mp4') && !e.children
      );

      showLoading(`正在载入封面图（共 ${mp4Entries.length} 部）…`);

      const videos = await Promise.all(
        mp4Entries.map(async (e) => {
          const path = normalizePath(e.path ?? `${selectedPath}\\${e.name}`);
          const [thumbnail, size] = await Promise.all([
            getThumbnail(path).catch(() => null),
            getFileSize(path).catch(() => 0),
          ]);
          return { name: e.name, path, size, thumbnail };
        })
      );

      state.folderPath = selectedPath;
      state.videos = videos;

      showLoading('正在保存到数据库…');
      await saveToStorage();

      showLibrary();
      hideLoading();
      showToast(`重新载入 ${videos.length} 部影片`, 'success');
      startWatching(selectedPath);

    } catch (err) {
      hideLoading();
      showToast(`重新选择失败：${String(err)}`, 'warn');
    }
  });

  // 清除所有资料
  document.getElementById('btnClearAll').addEventListener('click', async () => {
    if (!confirm('确定要清除所有储存资料吗？')) return;

    await clearAllStorage();

    showPage('page-home');
    showToast('已清除所有资料', 'success');
  });
}
