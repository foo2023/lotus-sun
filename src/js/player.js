import { state, SAVE_INTERVAL } from './state.js';
import { getTauriAPI, formatTime, formatDateTime, normalizePath } from './utils.js';
import { showPage } from './router.js';
import { showToast } from './toast.js';
import { saveProgress } from './storage.js';
import { renderGrid, updateStats } from './library.js';

// DOM 元素引用
let video, saveInd, saveText, infoCurrentTime, infoDuration, infoLastSaved, playerProgressBar;

// ── 初始化播放器 DOM 引用 ──
export function initPlayerElements() {
  video = document.getElementById('mainVideo');
  saveInd = document.getElementById('saveIndicator');
  saveText = document.getElementById('saveText');
  infoCurrentTime = document.getElementById('infoCurrentTime');
  infoDuration = document.getElementById('infoDuration');
  infoLastSaved = document.getElementById('infoLastSaved');
  playerProgressBar = document.getElementById('playerProgressBar');
}

// ── 打开影片 ──
export function openVideo(videoItem) {
  const tauri = getTauriAPI();
  if (!tauri) return;

  const assetUrl = tauri.core.convertFileSrc(videoItem.path);
  console.log('[openVideo]', videoItem.path, '→', assetUrl);

  state.currentVideo = videoItem;
  document.getElementById('playerTitle').textContent = videoItem.name.replace(/\.mp4$/i, '');

  // 恢复上次播放进度（需在设置 src 前确定目标时间）
  const normPath = normalizePath(videoItem.path);
  const prog = state.progress[normPath];
  console.log('[openVideo] 查找进度 key:', normPath, '→', prog);
  console.log('[openVideo] 当前 state.progress keys:', Object.keys(state.progress));
  const targetTime = (prog && prog.currentTime > 2) ? prog.currentTime : 0;

  // 清除旧 src，让浏览器完全重置元素状态
  video.removeAttribute('src');
  video.load();

  if (targetTime > 0) {
    let restored = false;

    const restore = () => {
      if (restored) return;
      // 只有在视频真正有时长时才 seek
      if (video.duration && isFinite(video.duration)) {
        restored = true;
        video.currentTime = targetTime;
        updatePlayerInfo();
        showToast(`从 ${formatTime(targetTime)} 继续播放`, 'success');
        console.log('[openVideo] 进度已恢复至', targetTime);
      }
    };

    // 监听 loadedmetadata 和 canplay（双保险）
    video.addEventListener('loadedmetadata', restore);
    video.addEventListener('canplay', restore);

    // 轮询兜底：如果两个事件都没触发，每 200ms 检查一次，最多 10 秒
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      restore();
      if (restored || attempts >= 50) clearInterval(poll);
    }, 200);
  }

  video.src = assetUrl;

  setSaveIndicator('idle');
  showPage('page-player');
  startSaveTimer();
}

// ── 启动自动保存定时器 ──
function startSaveTimer() {
  if (state.saveTimer) clearInterval(state.saveTimer);
  state.saveTimer = setInterval(() => {
    if (!video.paused && !video.ended && state.currentVideo) doSave();
  }, SAVE_INTERVAL);
}

// ── 停止自动保存定时器 ──
function stopSaveTimer() {
  if (state.saveTimer) {
    clearInterval(state.saveTimer);
    state.saveTimer = null;
  }
}

// ── 执行保存 ──
function doSave() {
  if (!state.currentVideo) return;
  saveProgress(normalizePath(state.currentVideo.path), video.currentTime, video.duration);
  setSaveIndicator('saving');
  updatePlayerInfo();
  setTimeout(() => setSaveIndicator('idle'), 1500);
}

// ── 设置保存指示器状态 ──
function setSaveIndicator(mode) {
  if (mode === 'saving') {
    saveInd.classList.add('saving');
    saveText.textContent = '已储存进度';
  } else {
    saveInd.classList.remove('saving');
    saveText.textContent = video.paused ? '已暂停' : '播放中（每10秒自动储存）';
  }
}

// ── 更新播放器信息 ──
function updatePlayerInfo() {
  infoCurrentTime.textContent = formatTime(video.currentTime);
  infoDuration.textContent = formatTime(video.duration);
  const prog = state.currentVideo ? state.progress[normalizePath(state.currentVideo.path)] : null;
  infoLastSaved.textContent = prog ? formatDateTime(prog.updatedAt) : '—';
  const pct = video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0;
  playerProgressBar.style.width = pct.toFixed(2) + '%';
}

// ── 初始化播放器事件 ──
export function initPlayerEvents() {
  video.addEventListener('play', () => setSaveIndicator('idle'));
  video.addEventListener('pause', () => { doSave(); setSaveIndicator('idle'); });
  video.addEventListener('ended', () => { doSave(); showToast('影片播放完毕 🎉', 'success'); });
  video.addEventListener('timeupdate', updatePlayerInfo);

  document.getElementById('btnBack').addEventListener('click', () => {
    if (state.currentVideo && !video.paused) doSave();
    stopSaveTimer();
    video.pause();
    video.src = '';
    renderGrid(state.videos);
    updateStats();
    showPage('page-library');
  });
}
