import { state } from './state.js';
import { normalizePath } from './utils.js';

// ── 等待 window.__TAURI__ 就绪 ──
function waitForTauri(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (window.__TAURI__?.core?.invoke) return resolve();
    const start = Date.now();
    const id = setInterval(() => {
      if (window.__TAURI__?.core?.invoke) {
        clearInterval(id);
        resolve();
      } else if (Date.now() - start >= timeout) {
        clearInterval(id);
        reject(new Error('[DB] window.__TAURI__ 超时未就绪'));
      }
    }, 50);
  });
}

// ── 封装 invoke 调用 ──
async function dbExecute(query, values = []) {
  return window.__TAURI__.core.invoke('plugin:sql|execute', {
    db: 'sqlite:lotus-sun.db',
    query,
    values,
  });
}

async function dbSelect(query, values = []) {
  return window.__TAURI__.core.invoke('plugin:sql|select', {
    db: 'sqlite:lotus-sun.db',
    query,
    values,
  });
}

async function dbLoad() {
  return window.__TAURI__.core.invoke('plugin:sql|load', {
    db: 'sqlite:lotus-sun.db',
  });
}

// ── 初始化存储（建表） ──
export async function initStorage() {
  try {
    await waitForTauri();
    await dbLoad();

    await dbExecute(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await dbExecute(`
      CREATE TABLE IF NOT EXISTS videos (
        path      TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        size      INTEGER NOT NULL DEFAULT 0,
        thumbnail TEXT,
        added_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // 注意：用 "position" 而非 "current_time"，
    // 因为 current_time 是 SQLite 内置关键字，会被替换为当前 UTC 时间字符串
    await dbExecute(`
      CREATE TABLE IF NOT EXISTS progress (
        path       TEXT PRIMARY KEY,
        position   INTEGER NOT NULL DEFAULT 0,
        duration   INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // ── 迁移旧表：current_time 列 → position 列 ──
    await migrateOldColumns();

    // ── 迁移路径：统一斜杠为反斜杠 ──
    await migratePathsToBackslash();

    console.log('[Storage] SQLite 初始化完成');
  } catch (e) {
    console.error('[Storage] 初始化失败:', e);
  }
}

// ── 迁移旧 current_time 列为 position ──
async function migrateOldColumns() {
  try {
    const cols = await dbSelect(`PRAGMA table_info(progress)`);
    const hasOldCol = cols.some(c => c.name === 'current_time');
    const hasNewCol = cols.some(c => c.name === 'position');

    if (!hasOldCol) return; // 已经是新表，无需迁移

    if (!hasNewCol) {
      // 添加新列
      await dbExecute(`ALTER TABLE progress ADD COLUMN position INTEGER NOT NULL DEFAULT 0`);
    }

    // 将旧列的整数值（若不是时间字符串）复制到新列
    // current_time 存的是 "HH:MM:SS" 字符串，需要跳过
    // 只迁移看起来是纯数字的值
    await dbExecute(`
      UPDATE progress
      SET position = CAST("current_time" AS INTEGER)
      WHERE "current_time" GLOB '[0-9]*'
        AND position = 0
    `);

    console.log('[Migration] current_time → position 列迁移完成');
  } catch (e) {
    console.warn('[Migration] 列迁移出错（忽略）:', e);
  }
}

// ── 迁移路径：将 / 统一为 \ ──
async function migratePathsToBackslash() {
  try {
    // 迁移 progress 表
    const progRows = await dbSelect(`SELECT path FROM progress`);
    for (const r of progRows) {
      const normalized = normalizePath(r.path);
      if (normalized !== r.path) {
        await dbExecute(
          `INSERT INTO progress (path, position, duration, updated_at)
           SELECT ?, position, duration, updated_at FROM progress WHERE path = ?
           ON CONFLICT(path) DO UPDATE SET
             position   = excluded.position,
             duration   = excluded.duration,
             updated_at = excluded.updated_at`,
          [normalized, r.path]
        );
        await dbExecute(`DELETE FROM progress WHERE path = ?`, [r.path]);
        console.log('[Migration] progress 路径已规范化:', r.path, '→', normalized);
      }
    }

    // 迁移 videos 表
    const videoRows = await dbSelect(`SELECT path, name, size, thumbnail, added_at FROM videos`);
    for (const r of videoRows) {
      const normalized = normalizePath(r.path);
      if (normalized !== r.path) {
        await dbExecute(
          `INSERT INTO videos (path, name, size, thumbnail, added_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET
             name      = excluded.name,
             size      = excluded.size,
             thumbnail = COALESCE(excluded.thumbnail, videos.thumbnail)`,
          [normalized, r.name, r.size, r.thumbnail, r.added_at]
        );
        await dbExecute(`DELETE FROM videos WHERE path = ?`, [r.path]);
        console.log('[Migration] videos 路径已规范化:', r.path, '→', normalized);
      }
    }
  } catch (e) {
    console.warn('[Migration] 路径迁移出错（忽略）:', e);
  }
}

// ── 从数据库加载所有数据到 state ──
export async function loadFromStorage() {
  try {
    await waitForTauri();

    // 读取 folder_path
    const settingRows = await dbSelect(
      `SELECT value FROM settings WHERE key = 'folder_path'`
    );
    state.folderPath = settingRows[0]?.value ?? '';

    // 读取视频列表（规范化路径）
    const videoRows = await dbSelect(
      `SELECT path, name, size, thumbnail FROM videos ORDER BY added_at ASC`
    );
    state.videos = videoRows.map(r => ({
      path: normalizePath(r.path),
      name: r.name,
      size: r.size,
      thumbnail: r.thumbnail ?? null,
    }));

    // 读取播放进度（使用 position 列，避免 current_time 关键字冲突）
    const progRows = await dbSelect(
      `SELECT path, position, duration, updated_at FROM progress`
    );
    console.log('[Storage] 原始进度行样本:', JSON.stringify(progRows[0]));
    state.progress = {};
    for (const r of progRows) {
      state.progress[normalizePath(r.path)] = {
        currentTime: Number(r.position) || 0,
        duration:    Number(r.duration)  || 0,
        updatedAt:   r.updated_at ?? '',
      };
    }

    console.log(`[Storage] 已加载：${state.videos.length} 部影片，进度条目：${Object.keys(state.progress).length}，folderPath="${state.folderPath}"`);
    console.log('[Storage] 进度样本值:', JSON.stringify(Object.values(state.progress)[0]));
  } catch (e) {
    console.error('[Storage] 加载失败:', e);
  }
}

// ── 保存全部视频列表 + folderPath ──
export async function saveToStorage() {
  try {
    await waitForTauri();

    await dbExecute(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('folder_path', ?)`,
      [state.folderPath]
    );

    await dbExecute('BEGIN');
    try {
      for (const v of state.videos) {
        await dbExecute(
          `INSERT INTO videos (path, name, size, thumbnail)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET
             name      = excluded.name,
             size      = excluded.size,
             thumbnail = COALESCE(excluded.thumbnail, videos.thumbnail)`,
          [v.path, v.name, v.size ?? 0, v.thumbnail ?? null]
        );
      }

      if (state.videos.length > 0) {
        const placeholders = state.videos.map(() => '?').join(',');
        await dbExecute(
          `DELETE FROM videos WHERE path NOT IN (${placeholders})`,
          state.videos.map(v => v.path)
        );
      } else {
        await dbExecute(`DELETE FROM videos`);
      }

      await dbExecute('COMMIT');
    } catch (err) {
      await dbExecute('ROLLBACK');
      throw err;
    }

    console.log('[Storage] 已保存到 SQLite');
  } catch (e) {
    console.error('[Storage] 保存失败:', e);
  }
}

// ── 保存单条播放进度 ──
export async function saveProgress(path, currentTime, duration) {
  const key = normalizePath(path);
  const pos = isFinite(currentTime) ? Math.floor(currentTime) : 0;
  const dur = isFinite(duration)    ? Math.floor(duration)    : 0;

  // 只有播放位置 > 0 才有意义
  if (pos <= 0) return;

  // 同步更新 state
  state.progress[key] = {
    currentTime: pos,
    duration:    dur,
    updatedAt:   new Date().toISOString(),
  };

  try {
    await waitForTauri();
    // 使用 position 列，避免与 SQLite 内置 current_time 关键字冲突
    await dbExecute(
      `INSERT INTO progress (path, position, duration, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(path) DO UPDATE SET
         position   = excluded.position,
         duration   = excluded.duration,
         updated_at = excluded.updated_at`,
      [key, pos, dur]
    );
    console.log('[Storage] 进度已保存:', key, pos);
  } catch (e) {
    console.error('[Storage] 保存进度失败:', e);
  }
}

// ── 清除所有数据 ──
export async function clearAllStorage() {
  try {
    await waitForTauri();
    await dbExecute('DELETE FROM progress');
    await dbExecute('DELETE FROM videos');
    await dbExecute('DELETE FROM settings');
    state.folderPath = '';
    state.videos = [];
    state.progress = {};
    console.log('[Storage] 已清除所有数据');
  } catch (e) {
    console.error('[Storage] 清除失败:', e);
  }
}
