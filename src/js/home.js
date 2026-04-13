import { state } from './state.js';
import { getTauriAPI, getThumbnail, getFileSize, normalizePath } from './utils.js';
import { showToast } from './toast.js';
import { saveToStorage } from './storage.js';
import { showLibrary } from './library.js';
import { startWatching } from './watcher.js';
import { showLoading, hideLoading } from './loading.js';

// ── 初始化首页事件 ──
export function initHomeEvents() {
  document.getElementById('btnPickFolder').addEventListener('click', async () => {
    const tauri = getTauriAPI();
    if (!tauri) {
      showToast('Tauri API 未载入，请检查 withGlobalTauri 设定', 'warn');
      return;
    }

    try {
      const selectedPath = await tauri.dialog.open({
        directory: true,
        multiple: false,
        title: '选择影片资料夹',
      });

      if (!selectedPath) return;

      showLoading('正在扫描影片…');

      const entries = await tauri.fs.readDir(selectedPath);
      const mp4Entries = entries.filter(e =>
        e.name &&
        e.name.toLowerCase().endsWith('.mp4') &&
        !e.children
      );

      if (!mp4Entries.length) {
        hideLoading();
        showToast('此资料夹内没有找到 .mp4 影片', 'warn');
        return;
      }

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
      showToast(`载入 ${videos.length} 部影片 ✅`, 'success');
      startWatching(selectedPath);

    } catch (err) {
      hideLoading();
      console.error('[选择资料夹失败]', err);
      showToast(`错误：${String(err)}`, 'warn', 5000);
    }
  });
}
