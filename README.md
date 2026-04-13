# Lotus Sun

本地影片播放器，基于 Tauri v2 + 原生 HTML/CSS/JS 构建，使用 SQLite 持久化存储播放进度与影片列表。

---

## 项目结构

```
lotus-sun/
├── src/                        # 前端源码
│   ├── index.html              # 应用主页面
│   ├── styles/
│   │   ├── variables.css       # CSS 变量、全局 reset、loading overlay 样式
│   │   ├── pages.css           # 各页面布局样式（Home / Library / Player）
│   │   └── components.css      # 通用组件样式（卡片、toast 等）
│   ├── assets/
│   │   ├── icon.svg            # 应用图标
│   │   ├── lotus.svg           # 首页装饰图
│   │   └── loading.svg         # 启动加载动画
│   ├── openplayer.js           # OpenPlayerJS UMD 库（第三方播放器）
│   ├── openplayer.css          # OpenPlayerJS 样式
│   └── js/
│       ├── main.js             # 应用入口：初始化流程、调用 loading 遮罩
│       ├── loading.js          # Loading 遮罩控制（showLoading / hideLoading）
│       ├── state.js            # 全局状态对象（folderPath / videos / progress）
│       ├── storage.js          # SQLite 数据层：读写进度、影片列表、设置
│       ├── router.js           # 页面路由：showPage() 切换 .page.active
│       ├── home.js             # 首页逻辑：选择资料夹、扫描 MP4、首次保存
│       ├── library.js          # 资料库页面：渲染影片格子、搜索、统计、清除
│       ├── player.js           # 播放器页面：打开影片、恢复进度、自动保存
│       ├── watcher.js          # 文件夹监听：启动同步、实时侦测新增/删除
│       ├── utils.js            # 工具函数：格式化时间/大小、截取缩略图
│       └── toast.js            # Toast 通知组件
├── src-tauri/                  # Rust 后端（Tauri）
│   ├── src/
│   │   ├── lib.rs              # Tauri 插件注册、文件夹 watcher 命令
│   │   └── main.rs             # 程序入口
│   ├── capabilities/
│   │   └── default.json        # 权限声明（fs / dialog / sql）
│   ├── Cargo.toml              # Rust 依赖（tauri-plugin-sql、notify 等）
│   └── tauri.conf.json         # Tauri 配置（窗口、asset protocol、withGlobalTauri）
└── package.json                # npm 脚本（tauri dev / build）
```

---

## 模块职责说明

### `src/index.html`
应用唯一的 HTML 文件，包含三个页面 div（`#page-home`、`#page-library`、`#page-player`）和一个 `#loadingOverlay` 启动遮罩。页面切换通过 CSS class `active` 控制显示/隐藏，不做路由跳转。

### `src/js/main.js`
应用启动入口。按顺序执行：显示 loading 遮罩 → 初始化 SQLite → 从数据库加载状态 → 注册各页面事件 → 初始化 OpenPlayerJS → 根据 `state.folderPath` 决定显示首页或资料库 → 隐藏 loading 遮罩。任何初始化错误都会确保遮罩被移除。

### `src/js/state.js`
单一数据源。导出 `state` 对象（`folderPath`、`videos`、`progress`、`currentVideo`、`saveTimer`）和常量 `SAVE_INTERVAL`。所有模块共享同一个引用，修改即全局生效。

### `src/js/storage.js`
SQLite 数据层，通过 `window.__TAURI__.core.invoke('plugin:sql|...')` 直接调用 Tauri SQL 插件命令。
- `initStorage()` — 等待 Tauri 就绪，建立三张表（settings / videos / progress）
- `loadFromStorage()` — 读取所有数据填充 `state`，含进度恢复
- `saveToStorage()` — 事务批量 upsert 影片列表与 folderPath
- `saveProgress()` — 单条进度 upsert，同步更新 `state.progress`
- `clearAllStorage()` — 清空所有表与 state

### `src/js/router.js`
极简路由。`showPage(id)` 移除所有 `.page` 的 `active` class，再给目标页面加上，实现单页切换。

### `src/js/home.js`
首页「选择资料夹」按钮逻辑。调用 Tauri dialog 选择目录，扫描 MP4 文件，并行生成缩略图与文件大小，写入 `state` 后调用 `saveToStorage()` 持久化，最后跳转资料库页面。

### `src/js/library.js`
资料库页面。
- `renderGrid()` — 根据 `state.videos` 渲染影片卡片，读取 `state.progress` 显示进度条与续播徽章
- `updateStats()` — 更新总数与已观看数
- `showLibrary()` — 组合以上两者并切换页面
- 事件：搜索过滤、重新选择资料夹、清除所有数据

### `src/js/player.js`
播放器页面。
- `openVideo()` — 设置 video src，查找 `state.progress` 恢复上次进度（兼容 metadata 已缓存的情况），切换到播放器页面
- 自动保存定时器：每 10 秒在播放中调用 `saveProgress()`
- 暂停/结束时立即保存
- 返回按钮：保存进度、清空 src、回到资料库

### `src/js/watcher.js`
文件夹变动监听。
- `syncFolderOnStartup()` — 启动时对比数据库与磁盘，处理软件关闭期间的新增/删除
- `startWatching()` — 调用 Rust `start_watching` 命令 + 监听 `folder-changed` 事件，防抖 800ms 后刷新
- `stopWatching()` — 清理监听器

### `src/js/utils.js`
纯工具函数：`getTauriAPI()`、`formatTime()`、`formatBytes()`、`formatDateTime()`、`getFileSize()`、`getThumbnail()`（用 canvas 截取视频帧）。

### `src/js/toast.js`
轻量 Toast 通知，`showToast(message, type, duration)` 动态创建并自动移除通知元素。

### `src-tauri/src/lib.rs`
Rust 后端。注册 `tauri-plugin-sql`、`tauri-plugin-fs`、`tauri-plugin-dialog` 插件，并暴露两个自定义命令：`start_watching`（用 `notify` crate 监听文件夹，检测到 MP4 变动时 emit `folder-changed` 事件）和 `stop_watching`。

### `src-tauri/capabilities/default.json`
声明前端可使用的 Tauri 权限，包括文件系统读写、dialog、SQL 的 load/select/execute。

---

## 数据流

```
启动
  └─ initStorage()  ──→  建表（SQLite）
  └─ loadFromStorage() ─→  state.folderPath / state.videos / state.progress

选择资料夹
  └─ home.js ──→  扫描 MP4 ──→  state.videos ──→  saveToStorage()

播放影片
  └─ openVideo() ──→  state.progress[path].currentTime ──→  video.currentTime
  └─ 每 10 秒 / 暂停 / 结束 ──→  saveProgress() ──→  SQLite progress 表
```
