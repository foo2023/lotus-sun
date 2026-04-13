import { state } from './state.js';
import { getTauriAPI, getThumbnail, getFileSize, normalizePath } from './utils.js';
import { showToast } from './toast.js';
import { saveToStorage } from './storage.js';
import { renderGrid, updateStats } from './library.js';

let unlistenFn = null;
let debounceTimer = null;

// ── 启动时同步文件夹（处理应用关闭期间的变动） ──
export async function syncFolderOnStartup() {
  const tauri = getTauriAPI();
  if (!tauri || !state.folderPath) return;

  console.log('[Watcher] 启动时同步文件夹:', state.folderPath);

  try {
    // 检查文件夹是否仍然存在
    const folderExists = await tauri.fs.exists(state.folderPath);
    if (!folderExists) {
      console.warn('[Watcher] 文件夹已不存在:', state.folderPath);
      showToast('上次的视频资料夹已不存在，请重新选择', 'warn', 5000);
      return;
    }

    const entries = await tauri.fs.readDir(state.folderPath);
    const mp4Entries = entries.filter(e =>
      e.name && e.name.toLowerCase().endsWith('.mp4') && !e.children
    );

    const existingPaths = new Set(state.videos.map(v => normalizePath(v.path)));
    const currentPaths = new Set(
      mp4Entries.map(e => normalizePath(e.path ?? `${state.folderPath}\\${e.name}`))
    );

    const added = mp4Entries.filter(e => {
      const p = normalizePath(e.path ?? `${state.folderPath}\\${e.name}`);
      return !existingPaths.has(p);
    });
    const removedCount = state.videos.filter(v => !currentPaths.has(normalizePath(v.path))).length;

    if (!added.length && !removedCount) {
      console.log('[Watcher] 启动同步：文件夹无变动');
      return;
    }

    console.log(`[Watcher] 启动同步：新增 ${added.length} 部，删除 ${removedCount} 部`);

    // 为新增影片生成缩略图和文件大小
    const newVideos = await Promise.all(
      added.map(async (e) => {
        const path = normalizePath(e.path ?? `${state.folderPath}\\${e.name}`);
        const [thumbnail, size] = await Promise.all([
          getThumbnail(path).catch(() => null),
          getFileSize(path).catch(() => 0),
        ]);
        return { name: e.name, path, size, thumbnail };
      })
    );

    // 保留现有影片（含进度），追加新增，移除已删除
    state.videos = [
      ...state.videos.filter(v => currentPaths.has(normalizePath(v.path))),
      ...newVideos,
    ];

    await saveToStorage();

    if (added.length) showToast(`软件关闭期间新增了 ${added.length} 部影片 🎉`, 'success', 4000);
    if (removedCount) showToast(`软件关闭期间移除了 ${removedCount} 部影片`, 'info', 4000);

  } catch (err) {
    console.error('[Watcher] 启动同步失败:', err);
  }
}

// ── 开始监听资料夹变动 ──
export async function startWatching(folderPath) {
  await stopWatching();

  const tauri = getTauriAPI();
  if (!tauri || !folderPath) return;

  try {
    await tauri.core.invoke('start_watching', { path: folderPath });

    unlistenFn = await tauri.event.listen('folder-changed', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshCurrentFolder, 800);
    });

    console.log('[Watcher] 开始监听:', folderPath);
  } catch (err) {
    console.error('[Watcher] 启动失败:', err);
  }
}

// ── 停止监听 ──
export async function stopWatching() {
  clearTimeout(debounceTimer);

  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }

  const tauri = getTauriAPI();
  if (!tauri) return;

  try {
    await tauri.core.invoke('stop_watching');
  } catch (_) {}
}

// ── 侦测到变动后重新扫描资料夹 ──
async function refreshCurrentFolder() {
  const tauri = getTauriAPI();
  if (!tauri || !state.folderPath) return;

  try {
    const entries = await tauri.fs.readDir(state.folderPath);
    const mp4Entries = entries.filter(e =>
      e.name && e.name.toLowerCase().endsWith('.mp4') && !e.children
    );

    const existingPaths = new Set(state.videos.map(v => normalizePath(v.path)));
    const currentPaths = new Set(
      mp4Entries.map(e => normalizePath(e.path ?? `${state.folderPath}\\${e.name}`))
    );

    const added = mp4Entries.filter(e => {
      const p = normalizePath(e.path ?? `${state.folderPath}\\${e.name}`);
      return !existingPaths.has(p);
    });
    const removedCount = state.videos.filter(v => !currentPaths.has(normalizePath(v.path))).length;

    if (!added.length && !removedCount) return;

    // 为新增影片生成缩略图和文件大小
    const newVideos = await Promise.all(
      added.map(async (e) => {
        const path = normalizePath(e.path ?? `${state.folderPath}\\${e.name}`);
        const [thumbnail, size] = await Promise.all([
          getThumbnail(path).catch(() => null),
          getFileSize(path).catch(() => 0),
        ]);
        return { name: e.name, path, size, thumbnail };
      })
    );

    // 保留现有影片（含进度），追加新增，移除已删除
    state.videos = [
      ...state.videos.filter(v => currentPaths.has(normalizePath(v.path))),
      ...newVideos,
    ];

    await saveToStorage();
    renderGrid(state.videos);
    updateStats();

    if (added.length) showToast(`侦测到 ${added.length} 部新影片`, 'success');
    if (removedCount) showToast(`已移除 ${removedCount} 部影片`, 'info');

  } catch (err) {
    console.error('[Watcher] 刷新失败:', err);
  }
}
