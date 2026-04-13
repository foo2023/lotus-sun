// ── 路径规范化（统一使用反斜杠，消除 Windows 路径混用问题） ──
export function normalizePath(p) {
  if (!p) return p;
  return p.replace(/\//g, '\\');
}

// ── 安全取得 Tauri v2 API ──
export function getTauriAPI() {
  const t = window.__TAURI__;
  if (!t) {
    console.error('[Tauri] window.__TAURI__ 不存在，请确认 withGlobalTauri: true');
    return null;
  }
  return t;
}

// ── 时间格式化 ──
export function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── 文件大小格式化 ──
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(0) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}

// ── 时间日期格式化 ──
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ── 获取文件大小（bytes） ──
export async function getFileSize(filePath) {
  const tauri = getTauriAPI();
  if (!tauri) return 0;
  try {
    const stat = await tauri.fs.stat(filePath);
    return stat.size ?? 0;
  } catch {
    return 0;
  }
}

// ── 截取视频缩略图（智能提取，避免重复的开头） ──
export function getThumbnail(filePath) {
  const tauri = getTauriAPI();
  if (!tauri) return Promise.resolve(null);

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = tauri.core.convertFileSrc(filePath);
    video.muted = true;

    // 监听元数据加载，获取视频总长度
    video.addEventListener('loadedmetadata', () => {
      // 智能选择时间点：避免开头（通常 0-3 秒是片头）
      // 选择视频长度的 15% 处，这样既避免开头，也不会太靠后
      const duration = video.duration;
      const targetTime = Math.max(3, duration * 0.15); // 至少 3 秒，或视频长度的 15%
      
      video.currentTime = targetTime;
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        const maxWidth = 320;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 转换为 JPEG 数据 URL，质量 0.6 以减小文件大小
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      } catch (err) {
        console.warn('Failed to draw thumbnail:', err);
        resolve(null);
      }
    });

    video.addEventListener('error', () => {
      console.warn('Failed to load video for thumbnail:', filePath);
      resolve(null);
    });
  });
}
