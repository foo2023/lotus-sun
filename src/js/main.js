import { state } from './state.js';
import { initStorage, loadFromStorage } from './storage.js';
import { showPage } from './router.js';
import { showToast } from './toast.js';
import { initHomeEvents } from './home.js';
import { initLibraryEvents, showLibrary } from './library.js';
import { initPlayerElements, initPlayerEvents } from './player.js';
import { startWatching, syncFolderOnStartup } from './watcher.js';
import { showLoading, hideLoading } from './loading.js';

// ── 应用初始化 ──
async function init() {
  showLoading('正在载入数据库…');

  // 初始化存储（等待 Tauri SQL plugin 就绪）
  await initStorage();
  await loadFromStorage();

  console.log('[Init] 已加载进度条目数:', Object.keys(state.progress).length);

  // 初始化各页面事件
  initHomeEvents();
  initLibraryEvents();
  initPlayerElements();
  initPlayerEvents();

  // 初始化 OpenPlayer
  const opPlayer = new OpenPlayerJS('mainVideo', {
    startTime: 0,
    startVolume: 1,
    controls: {
      top: ['progress'],
      'center-left': ['play', 'duration', 'volume'],
      'center-right': ['captions', 'fullscreen', 'settings'],
    },
  });
  opPlayer.init();

  // 根据状态显示对应页面
  console.log('[Init] Folder path:', state.folderPath);
  if (state.folderPath) {
    showLoading('正在同步影片资料夹…');
    await syncFolderOnStartup();

    if (state.videos.length > 0) {
      showLibrary();
      showToast(`欢迎回来，共 ${state.videos.length} 部影片`, 'info', 3000);
    } else {
      showPage('page-home');
    }

    startWatching(state.folderPath);
  } else {
    showPage('page-home');
  }

  hideLoading();
}

// 启动应用（确保 loading 遮罩在任何情况下都能被隐藏）
init().catch(err => {
  console.error('[Init] 初始化失败:', err);
  hideLoading();
});
