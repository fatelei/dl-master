import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./styles.css";

type ToolStatus = {
  ytdlp_available: boolean;
  ytdlp_path: string | null;
  ffmpeg_available: boolean;
  ffmpeg_path: string | null;
  managed_ytdlp_path: string;
  default_download_dir: string;
};

type DownloadEvent = {
  job_id: string;
  status: "queued" | "running" | "warning" | "completed" | "failed";
  message: string;
  progress: number | null;
  file_path: string | null;
  size_bytes: number | null;
};

type Job = {
  id: string;
  backendJobId: string | null;
  url: string;
  format: string;
  outputDir: string;
  archive: boolean;
  subtitles: boolean;
  playlist: boolean;
  proxy: string | null;
  attempts: number;
  status: DownloadEvent["status"];
  progress: number;
  totalBytes: number | null;
  filePath: string | null;
  message: string;
  startedAt: string;
};

type ThemeMode = "light" | "dark" | "auto";
type NotificationKind = "info" | "success" | "error";

const state = {
  route: "download",
  themeMode: "light" as ThemeMode,
  showNotifications: false,
  settings: {
    httpProxy: "",
    defaultResolution: "1440",
    downloadDir: ""
  },
  status: null as ToolStatus | null,
  jobs: [] as Job[],
  library: [] as LibraryItem[],
  notifications: [] as AppNotification[]
};

type LibraryItem = {
  id: string;
  title: string;
  quality: string;
  size: string;
  sizeBytes?: number;
  filePath: string | null;
  outputDir: string;
  completedAt: string;
};

type AppNotification = {
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  read: boolean;
  createdAt: string;
};

type PersistedSettings = {
  http_proxy?: string;
  default_resolution?: string;
  download_dir?: string;
};

type PersistedJobItem = {
  id: string;
  backend_job_id?: string | null;
  url: string;
  format: string;
  output_dir: string;
  archive?: boolean;
  subtitles?: boolean;
  playlist?: boolean;
  proxy?: string | null;
  attempts?: number;
  status: DownloadEvent["status"];
  progress?: number | null;
  total_bytes?: number | null;
  file_path?: string | null;
  message: string;
  started_at: string;
};

type PersistedLibraryItem = {
  id: string;
  title: string;
  quality: string;
  size: string;
  size_bytes?: number;
  file_path?: string | null;
  output_dir: string;
  completed_at: string;
};

type PersistedNotification = {
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  read: boolean;
  created_at: string;
};

type PersistedState = {
  theme_mode?: ThemeMode;
  settings?: PersistedSettings;
  jobs?: PersistedJobItem[];
  library?: PersistedLibraryItem[];
  notifications?: PersistedNotification[];
};

type LegacyPersistedState = {
  themeMode?: ThemeMode;
  settings?: {
    httpProxy?: string;
    defaultResolution?: string;
    downloadDir?: string;
  };
  jobs?: Job[];
  library?: LibraryItem[];
  notifications?: AppNotification[];
};

const LEGACY_STORAGE_KEY = "dl-master.state.v1";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("App root not found");
}

const appRoot = root;

function routeTo(route: string) {
  state.route = route;
  render();
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolvedDark() {
  return state.themeMode === "auto" ? systemPrefersDark() : state.themeMode === "dark";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return map[char];
  });
}

function formatLabel(format: string) {
  const labels: Record<string, string> = {
    best: "Best available",
    "2160": "MP4 4K",
    "1080": "MP4 1080p",
    "720": "MP4 720p",
    audio: "MP3 audio"
  };
  return labels[format] ?? format;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function parseYtdlpSize(message: string) {
  const match = message.match(/\bof\s+~?\s*([\d.]+)\s*([KMGT]i?B|B)\b/i);
  if (!match) return null;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  const unit = match[2].toUpperCase();
  const multiplier: Record<string, number> = {
    B: 1,
    KB: 1000,
    KIB: 1024,
    MB: 1000 ** 2,
    MIB: 1024 ** 2,
    GB: 1000 ** 3,
    GIB: 1024 ** 3,
    TB: 1000 ** 4,
    TIB: 1024 ** 4
  };

  return Math.round(value * (multiplier[unit] ?? 1));
}

function sizeLabelToBytes(size: string) {
  const match = size.match(/^\s*([\d.]+)\s*([KMGT]?i?B)\s*$/i);
  if (!match) return 0;

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return 0;

  const unit = match[2].toUpperCase();
  const multiplier: Record<string, number> = {
    B: 1,
    KB: 1000,
    KIB: 1024,
    MB: 1000 ** 2,
    MIB: 1024 ** 2,
    GB: 1000 ** 3,
    GIB: 1024 ** 3,
    TB: 1000 ** 4,
    TIB: 1024 ** 4
  };

  return Math.round(value * (multiplier[unit] ?? 1));
}

function libraryStats() {
  const completedBytes = state.library.reduce((sum, item) => sum + (item.sizeBytes ?? sizeLabelToBytes(item.size)), 0);
  return {
    completedJobs: state.library.length,
    completedBytes
  };
}

function pushNotification(title: string, body: string, kind: NotificationKind = "info") {
  state.notifications.unshift({
    id: crypto.randomUUID(),
    title,
    body,
    kind,
    read: false,
    createdAt: new Date().toLocaleTimeString()
  });
  state.notifications = state.notifications.slice(0, 30);
  savePersistedState();
}

function unreadNotificationCount() {
  return state.notifications.filter((item) => !item.read).length;
}

async function loadPersistedState() {
  const parsed = await invoke<PersistedState>("load_persisted_state");

  if (parsed.theme_mode === "light" || parsed.theme_mode === "dark" || parsed.theme_mode === "auto") {
    state.themeMode = parsed.theme_mode;
  }
  if (parsed.settings) {
    state.settings.httpProxy = typeof parsed.settings.http_proxy === "string" ? parsed.settings.http_proxy : state.settings.httpProxy;
    state.settings.defaultResolution =
      typeof parsed.settings.default_resolution === "string" ? parsed.settings.default_resolution : state.settings.defaultResolution;
    state.settings.downloadDir =
      typeof parsed.settings.download_dir === "string" ? parsed.settings.download_dir : state.settings.downloadDir;
  }
  if (Array.isArray(parsed.jobs)) {
    state.jobs = parsed.jobs
      .filter((item) => item && typeof item.id === "string" && typeof item.url === "string")
      .map((item) => ({
        id: item.id,
        backendJobId: typeof item.backend_job_id === "string" ? item.backend_job_id : item.backend_job_id ?? item.id,
        url: item.url,
        format: item.format,
        outputDir: item.output_dir,
        archive: Boolean(item.archive),
        subtitles: Boolean(item.subtitles),
        playlist: Boolean(item.playlist),
        proxy: typeof item.proxy === "string" ? item.proxy : item.proxy ?? null,
        attempts: typeof item.attempts === "number" && Number.isFinite(item.attempts) ? item.attempts : 1,
        status: item.status,
        progress: typeof item.progress === "number" ? item.progress : 0,
        totalBytes: typeof item.total_bytes === "number" ? item.total_bytes : null,
        filePath: typeof item.file_path === "string" ? item.file_path : item.file_path ?? null,
        message: item.message,
        startedAt: item.started_at
      }));
  }
  if (Array.isArray(parsed.library)) {
    state.library = parsed.library
      .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
      .map((item) => ({
        id: item.id,
        title: item.title,
        quality: item.quality,
        size: item.size,
        sizeBytes: typeof item.size_bytes === "number" ? item.size_bytes : undefined,
        filePath: typeof item.file_path === "string" ? item.file_path : item.file_path ?? null,
        outputDir: item.output_dir,
        completedAt: item.completed_at
      }));
  }
  if (Array.isArray(parsed.notifications)) {
    state.notifications = parsed.notifications
      .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
      .map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        kind: item.kind,
        read: item.read,
        createdAt: item.created_at
      }));
  }

  if (state.library.length === 0) {
    migrateLegacyStorage();
  }
}

function savePersistedState() {
  const payload: PersistedState = {
    theme_mode: state.themeMode,
    settings: {
      http_proxy: state.settings.httpProxy,
      default_resolution: state.settings.defaultResolution,
      download_dir: state.settings.downloadDir
    },
    jobs: state.jobs.map((item) => ({
      id: item.id,
      backend_job_id: item.backendJobId,
      url: item.url,
      format: item.format,
      output_dir: item.outputDir,
      archive: item.archive,
      subtitles: item.subtitles,
      playlist: item.playlist,
      proxy: item.proxy,
      attempts: item.attempts,
      status: item.status,
      progress: item.progress,
      total_bytes: item.totalBytes,
      file_path: item.filePath,
      message: item.message,
      started_at: item.startedAt
    })),
    library: state.library.map((item) => ({
      id: item.id,
      title: item.title,
      quality: item.quality,
      size: item.size,
      size_bytes: item.sizeBytes,
      file_path: item.filePath,
      output_dir: item.outputDir,
      completed_at: item.completedAt
    })),
    notifications: state.notifications.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      kind: item.kind,
      read: item.read,
      created_at: item.createdAt
    }))
  };
  void invoke("save_persisted_state", { state: payload }).catch((error) => {
    console.error("Failed to persist state", error);
  });
}

function migrateLegacyStorage() {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as LegacyPersistedState;
    if (parsed.themeMode === "light" || parsed.themeMode === "dark" || parsed.themeMode === "auto") {
      state.themeMode = parsed.themeMode;
    }
    if (parsed.settings) {
      if (typeof parsed.settings.httpProxy === "string") state.settings.httpProxy = parsed.settings.httpProxy;
      if (typeof parsed.settings.defaultResolution === "string") state.settings.defaultResolution = parsed.settings.defaultResolution;
      if (typeof parsed.settings.downloadDir === "string") state.settings.downloadDir = parsed.settings.downloadDir;
    }
    if (Array.isArray(parsed.library)) {
      state.library = parsed.library.filter((item) => item && typeof item.id === "string" && typeof item.title === "string");
    }
    if (Array.isArray(parsed.jobs)) {
      state.jobs = parsed.jobs
        .filter((item) => item && typeof item.id === "string" && typeof item.url === "string")
        .map((item) => ({
          id: item.id,
          backendJobId: item.id,
          url: item.url,
          format: item.format ?? "best",
          outputDir: item.outputDir ?? "",
          archive: Boolean(item.archive),
          subtitles: Boolean(item.subtitles),
          playlist: Boolean(item.playlist),
          proxy: typeof item.proxy === "string" ? item.proxy : item.proxy ?? null,
          attempts: typeof item.attempts === "number" && Number.isFinite(item.attempts) ? item.attempts : 1,
          status: item.status ?? "failed",
          progress: typeof item.progress === "number" ? item.progress : 0,
          totalBytes: typeof item.totalBytes === "number" ? item.totalBytes : null,
          filePath: typeof item.filePath === "string" ? item.filePath : item.filePath ?? null,
          message: item.message ?? "",
          startedAt: item.startedAt ?? new Date().toLocaleString()
        }));
    }
    if (Array.isArray(parsed.notifications)) {
      state.notifications = parsed.notifications.filter((item) => item && typeof item.id === "string" && typeof item.title === "string");
    }
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    void savePersistedState();
  } catch {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
}

async function refreshStatus() {
  state.status = await invoke<ToolStatus>("app_status");
  render();
}

type DownloadRequestPayload = {
  url: string;
  format: string;
  outputDir: string;
  archive: boolean;
  subtitles: boolean;
  playlist: boolean;
  proxy: string | null;
};

function currentDownloadRequest(): DownloadRequestPayload {
  return {
    url: getInput("download-url").trim(),
    outputDir: getInput("output-dir").trim() || state.settings.downloadDir.trim() || (state.status?.default_download_dir ?? ""),
    format: getInput("format-select"),
    archive: getChecked("archive-toggle"),
    subtitles: getChecked("subtitle-toggle"),
    playlist: getChecked("playlist-toggle"),
    proxy: state.settings.httpProxy.trim() || null
  };
}

async function installYtdlp() {
  setNotice("正在下载 yt-dlp 到应用数据目录...");
  try {
    await invoke<string>("install_ytdlp");
    await refreshStatus();
    pushNotification("yt-dlp installed", "Managed yt-dlp is ready to use.", "success");
    savePersistedState();
    setNotice("yt-dlp 已安装，可以开始下载。");
  } catch (error) {
    pushNotification("yt-dlp install failed", String(error), "error");
    setNotice(`安装失败：${String(error)}`);
  }
}

async function startDownload() {
  const request = currentDownloadRequest();

  if (!request.url) {
    setNotice("请输入视频或播放列表 URL。");
    return;
  }

  try {
    const result = await invoke<{ job_id: string }>("start_download", {
      request: {
        url: request.url,
        format: request.format,
        output_dir: request.outputDir,
        archive: request.archive,
        subtitles: request.subtitles,
        playlist: request.playlist,
        proxy: request.proxy
      }
    });

    state.jobs.unshift({
      id: result.job_id,
      backendJobId: result.job_id,
      url: request.url,
      format: request.format,
      outputDir: request.outputDir,
      archive: request.archive,
      subtitles: request.subtitles,
      playlist: request.playlist,
      proxy: request.proxy,
      attempts: 1,
      status: "queued",
      progress: 0,
      totalBytes: null,
      filePath: null,
      message: "Queued",
      startedAt: new Date().toLocaleString()
    });
    pushNotification("Download started", titleFromUrl(request.url), "info");
    savePersistedState();
    state.route = "queue";
    render();
  } catch (error) {
    pushNotification("Download failed to start", String(error), "error");
    setNotice(`无法启动下载：${String(error)}`);
  }
}

async function retryJob(job: Job) {
  try {
    const result = await invoke<{ job_id: string }>("start_download", {
      request: {
        url: job.url,
        format: job.format,
        output_dir: job.outputDir,
        archive: job.archive,
        subtitles: job.subtitles,
        playlist: job.playlist,
        proxy: job.proxy
      }
    });

    job.backendJobId = result.job_id;
    job.attempts += 1;
    job.status = "queued";
    job.progress = 0;
    job.totalBytes = null;
    job.filePath = null;
    job.message = "Queued for retry";
    job.startedAt = new Date().toLocaleString();
    pushNotification("Retry started", titleFromUrl(job.url), "info");
    savePersistedState();
    state.route = "queue";
    render();
  } catch (error) {
    pushNotification("Retry failed", String(error), "error");
    setNotice(`重试失败：${String(error)}`);
  }
}

async function openPath(path: string) {
  try {
    await invoke("open_path", { path });
  } catch (error) {
    setNotice(`无法打开路径：${String(error)}`);
  }
}

async function playFile(path: string) {
  try {
    await invoke("play_path", { path });
  } catch (error) {
    setNotice(`无法播放文件：${String(error)}`);
  }
}

async function deleteLibraryItem(id: string, filePath: string | null) {
  const item = state.library.find((entry) => entry.id === id);
  if (!item) return;

  try {
    await invoke("delete_library_item", { id, file_path: filePath });
    state.library = state.library.filter((entry) => entry.id !== id);
    savePersistedState();
    render();
    pushNotification("Library item deleted", item.title, "info");
    setNotice("Library item removed.");
  } catch (error) {
    pushNotification("Library delete failed", String(error), "error");
    setNotice(`Delete failed: ${String(error)}`);
  }
}

function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") + parsed.pathname;
  } catch {
    return url;
  }
}

async function cancelJob(jobId: string) {
  try {
    await invoke("cancel_download", { jobId });
    const job = state.jobs.find((item) => item.id === jobId);
    if (job) {
      job.status = "failed";
      job.message = "Cancelled by user";
      pushNotification("Download cancelled", titleFromUrl(job.url), "error");
      savePersistedState();
    }
    render();
  } catch (error) {
    setNotice(`取消失败：${String(error)}`);
  }
}

function getInput(id: string) {
  return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement)?.value ?? "";
}

function getChecked(id: string) {
  return Boolean((document.getElementById(id) as HTMLInputElement | null)?.checked);
}

function setNotice(message: string) {
  const notice = document.querySelector<HTMLDivElement>(".notice");
  if (notice) {
    notice.textContent = message;
    notice.classList.add("notice--visible");
    window.setTimeout(() => notice.classList.remove("notice--visible"), 4200);
  }
}

function render() {
  const isDark = resolvedDark();
  const unreadCount = unreadNotificationCount();
  document.documentElement.classList.toggle("dark", isDark);
  appRoot.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">download</div>
        <div>
          <h1>DL Master</h1>
          <p>v0.1.0</p>
        </div>
      </div>
      <button class="new-download" data-route="download"><span>add</span>New Download</button>
      <nav class="nav">
        ${navButton("download", "Download", "download")}
        ${navButton("queue", "Queue", "pending_actions")}
        ${navButton("library", "Library", "video_library")}
        ${navButton("settings", "Settings", "settings")}
      </nav>
      <div class="profile-card">
        <div class="avatar">DM</div>
        <div>
          <strong>${state.status?.ytdlp_available ? "yt-dlp Ready" : "yt-dlp Missing"}</strong>
          <small>${state.status?.ffmpeg_available ? "ffmpeg detected" : "ffmpeg optional"}</small>
        </div>
      </div>
    </aside>
    <main class="shell">
      <header class="topbar">
        ${topbarContent()}
        <div class="topbar-actions">
          <button class="icon-button" id="refresh-status">sync</button>
          <button class="icon-button notification ${unreadCount > 0 ? "has-unread" : ""}" id="notification-toggle">notifications</button>
          <button class="icon-button" id="theme-toggle">${isDark ? "light_mode" : "dark_mode"}</button>
        </div>
        ${state.showNotifications ? notificationPanel() : ""}
      </header>
      ${pageContent()}
    </main>
    <div class="notice"></div>
  `;

  wireEvents();
}

function topbarContent() {
  if (state.route === "library") {
    return `<div class="search-box"><span>search</span><input placeholder="Search your library..." /></div>`;
  }
  if (state.route === "settings") {
    return `<h2>Settings</h2><div class="settings-search"><span>search</span><input placeholder="Search settings..." /></div>`;
  }
  return `<h2>Download Manager</h2>`;
}

function navButton(route: string, label: string, icon: string) {
  const active = state.route === route ? "active" : "";
  return `<button class="nav-item ${active}" data-route="${route}"><span>${icon}</span>${label}</button>`;
}

function notificationPanel() {
  if (state.notifications.length === 0) {
    return `
      <section class="notification-panel">
        <div class="notification-panel-header">
          <strong>Notifications</strong>
          <button id="clear-notifications">Clear</button>
        </div>
        <div class="notification-empty">No notifications yet.</div>
      </section>
    `;
  }

  return `
    <section class="notification-panel">
      <div class="notification-panel-header">
        <strong>Notifications</strong>
        <button id="clear-notifications">Clear</button>
      </div>
      <div class="notification-list">
        ${state.notifications
          .map(
            (item) => `
              <article class="notification-item ${item.kind} ${item.read ? "read" : "unread"}">
                <div>
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.body)}</p>
                </div>
                <time>${escapeHtml(item.createdAt)}</time>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function pageTitle() {
  return {
    download: "Ready to download?",
    queue: "Download Queue",
    library: "Library",
    settings: "Settings"
  }[state.route];
}

function pageContent() {
  if (state.route === "queue") return queuePage();
  if (state.route === "library") return libraryPage();
  if (state.route === "settings") return settingsPage();
  return downloadPage();
}

function downloadPage() {
  const defaultDir = state.settings.downloadDir.trim() || (state.status?.default_download_dir ?? "");
  const stats = libraryStats();
  return `
    <section class="download-screen">
      <div class="download-heading">
        <h3>Ready to download?</h3>
        <p>Paste any video or audio URL below to start capturing high-quality content instantly.</p>
      </div>

      <div class="download-panel">
        <div class="download-row">
          <div class="url-field">
            <span>link</span>
            <input id="download-url" type="url" placeholder="https://youtube.com/watch?v=..." />
            <button id="paste-url">content_paste&nbsp; Paste Link</button>
          </div>
          <div class="format-field">
            <select id="format-select">
              <option value="2160" ${state.settings.defaultResolution === "2160" ? "selected" : ""}>MP4 4K</option>
              <option value="1440" ${state.settings.defaultResolution === "1440" ? "selected" : ""}>MP4 1440p</option>
              <option value="1080" ${state.settings.defaultResolution === "1080" ? "selected" : ""}>MP4 1080p</option>
              <option value="720" ${state.settings.defaultResolution === "720" ? "selected" : ""}>MP4 720p</option>
              <option value="audio">MP3 High (320kbps)</option>
              <option value="best" ${state.settings.defaultResolution === "best" ? "selected" : ""}>Best Available</option>
            </select>
          </div>
          <button class="download-button" id="start-download" ${state.status?.ytdlp_available ? "" : "disabled"}>
            <span>${state.status?.ytdlp_available ? "download" : "block"}</span>
            Download
          </button>
        </div>
        <div class="advanced-row">
          <label class="output-field">Output directory <input id="output-dir" value="${escapeHtml(defaultDir)}" /></label>
          ${switchRow("archive-toggle", "Archive downloaded IDs", true)}
          ${switchRow("subtitle-toggle", "Auto subtitles", false)}
          ${switchRow("playlist-toggle", "Allow playlist", false)}
        </div>
        ${state.status?.ytdlp_available ? "" : `<button class="install-button" id="install-ytdlp">Install yt-dlp</button>`}
      </div>

      <div class="dashboard-grid">
        <article class="how-card">
          <h4>How to Download</h4>
          <ol>
            <li><span>1</span><p>Find the video you want to save on YouTube, Vimeo, or social platforms.</p></li>
            <li><span>2</span><p>Copy the URL from the browser's address bar or the Share menu.</p></li>
            <li><span>3</span><p>Paste it here, select your preferred format, and hit Download.</p></li>
          </ol>
          <div class="pill-row"><span>Universal Support</span><span>Batch Processing</span></div>
        </article>

        <article class="stat-card">
          <span class="stat-icon">speed</span>
          <strong>${formatBytes(stats.completedBytes)}</strong>
          <p>${stats.completedJobs} saved in library</p>
          <button data-route="queue">View Queue</button>
        </article>

        ${featureCard("auto_awesome", "Smart Format Detection", "DL Master automatically analyzes the source to offer the highest available resolution up to 8K.")}
        ${featureCard("playlist_add_check", "Playlist Downloads", "Paste a playlist link to capture multiple videos at once. Queue them for efficient downloading.")}
        ${featureCard("bolt", "Turbo Engine", "yt-dlp progress is streamed from Rust to the desktop dashboard in real time.")}
      </div>

      <footer class="footer-line">
        <span>Engine: ${escapeHtml(state.status?.ytdlp_path ?? "yt-dlp not found")}</span>
        <span>Proxy: Disabled</span>
      </footer>
    </section>
  `;
}

function featureCard(icon: string, title: string, body: string) {
  return `
    <article class="feature-card">
      <div>${icon}</div>
      <h5>${title}</h5>
      <p>${body}</p>
    </article>
  `;
}

function switchRow(id: string, label: string, checked: boolean) {
  return `
    <label class="switch-row">
      <input id="${id}" type="checkbox" ${checked ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function queuePage() {
  if (state.jobs.length === 0) {
    return `
      <section class="empty-state">
        <div class="empty-icon">▦</div>
        <h3>No active jobs</h3>
        <p>Start a download and progress will appear here.</p>
        <button class="new-download compact" data-route="download">New Download</button>
      </section>
    `;
  }

  return `
    <section class="queue-list">
      ${state.jobs
        .map(
          (job) => `
          <article class="job-card">
            <div>
              <div class="job-meta">
                <span>${escapeHtml(formatLabel(job.format))}</span>
                <span>${escapeHtml(job.startedAt)}</span>
              </div>
              <h3>${escapeHtml(job.url)}</h3>
              <p>${escapeHtml(job.message)}</p>
            </div>
            <div class="job-side">
              <strong class="status-${job.status}">${job.status}</strong>
              <small>Attempt ${job.attempts}</small>
              <div class="progress"><span style="width:${Math.max(0, Math.min(100, job.progress))}%"></span></div>
              <div class="job-actions">
                ${
                  job.status === "failed"
                    ? `<button class="ghost retry-job" data-job="${job.id}">Retry</button>`
                    : ""
                }
                ${
                  job.status === "running" || job.status === "queued"
                    ? `<button class="ghost cancel-job" data-job="${job.id}">Cancel</button>`
                    : ""
                }
              </div>
            </div>
          </article>
        `
        )
        .join("")}
    </section>
  `;
}

function libraryPage() {
  if (state.library.length === 0) {
    return `
      <section class="library-header">
        <div>
          <h3>Library</h3>
          <p>Completed downloads will appear here after yt-dlp finishes.</p>
        </div>
      </section>
      <section class="empty-state">
        <div>
          <div class="empty-icon">video_library</div>
          <h3>No completed downloads yet</h3>
          <p>Start a download first. When it completes, this page will show the item and let you open its output folder.</p>
          <button class="new-download compact" data-route="download">New Download</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="library-header">
      <div>
        <h3>Library</h3>
        <p>Manage your downloaded high-resolution content.</p>
      </div>
      <div class="library-actions">
        <button class="secondary-button">sort&nbsp; Date Added</button>
        <button class="secondary-button">grid_view</button>
      </div>
    </section>
    <section class="library-grid">
      ${state.library
        .map(
          (item, index) => `
          <article class="video-card">
            <div class="thumb thumb-${index + 1}">
              <span>${escapeHtml(item.completedAt)}</span>
            </div>
            <div class="video-body">
              <h3>${escapeHtml(item.title)}</h3>
              <div><span>${escapeHtml(item.quality)}</span><span>${escapeHtml(formatBytes(item.sizeBytes ?? sizeLabelToBytes(item.size)))}</span></div>
              <div class="library-card-actions">
                <button class="play-library-file" data-path="${escapeHtml(item.filePath ?? "")}" ${item.filePath ? "" : "disabled"} aria-label="Play"><span>play_arrow</span></button>
                <button class="open-library-folder" data-path="${escapeHtml(item.outputDir)}" aria-label="Open folder"><span>folder_open</span></button>
                <button class="delete-library-item" data-id="${escapeHtml(item.id)}" data-path="${escapeHtml(item.filePath ?? "")}" aria-label="Delete library item" title="Delete"><span>delete</span></button>
              </div>
            </div>
          </article>
        `
        )
        .join("")}
    </section>
  `;
}

function settingsPage() {
  const status = state.status;
  const defaultDir = state.settings.downloadDir.trim() || (status?.default_download_dir ?? "");
  const selectedResolution = state.settings.defaultResolution;
  return `
    <section class="settings-page">
      <div class="settings-content">
        <section class="settings-group">
          <h3><span>tune</span>General</h3>
          <div class="settings-card">
            <div class="setting-field">
              <strong>Theme</strong>
              <div class="theme-grid">
                <button class="theme-option ${state.themeMode === "light" ? "selected" : ""}" data-theme="light"><span>light_mode</span><b>Light</b></button>
                <button class="theme-option ${state.themeMode === "dark" ? "selected" : ""}" data-theme="dark"><span>dark_mode</span><b>Dark</b></button>
                <button class="theme-option ${state.themeMode === "auto" ? "selected" : ""}" data-theme="auto"><span>settings_suggest</span><b>Auto</b></button>
              </div>
            </div>
          </div>
        </section>

        <section class="settings-group">
          <h3><span>download</span>Download</h3>
          <div class="settings-card">
            <label class="setting-field">
              <strong>Output path</strong>
              <div class="path-row">
                <input id="settings-output-dir" value="${escapeHtml(defaultDir)}" />
                <button id="browse-output">Browse</button>
              </div>
            </label>

            <label class="setting-field">
              <strong>Default resolution</strong>
              <select id="settings-resolution">
                <option value="2160" ${selectedResolution === "2160" ? "selected" : ""}>4K (2160p) - Ultra Quality</option>
                <option value="1440" ${selectedResolution === "1440" ? "selected" : ""}>2K (1440p) - High Quality</option>
                <option value="1080" ${selectedResolution === "1080" ? "selected" : ""}>1080p - Standard HD</option>
                <option value="720" ${selectedResolution === "720" ? "selected" : ""}>720p - Compact</option>
                <option value="best" ${selectedResolution === "best" ? "selected" : ""}>Best available</option>
              </select>
              <small>Selected resolution will be applied to all new downloads unless specified manually.</small>
            </label>
          </div>
        </section>

        <section class="settings-group">
          <h3><span>terminal</span>Advanced</h3>
          <div class="settings-card toolchain-card">
            <label class="setting-field">
              <strong>HTTP proxy</strong>
              <input id="settings-http-proxy" class="settings-input" value="${escapeHtml(state.settings.httpProxy)}" placeholder="http://127.0.0.1:7890" />
              <small>Optional. When set, downloads are launched with yt-dlp <code>--proxy</code>.</small>
            </label>
            <div>
              <strong>yt-dlp</strong>
              <code>${escapeHtml(status?.ytdlp_path ?? "Not found")}</code>
            </div>
            <div>
              <strong>Managed yt-dlp path</strong>
              <code>${escapeHtml(status?.managed_ytdlp_path ?? "")}</code>
            </div>
            <div>
              <strong>ffmpeg</strong>
              <code>${escapeHtml(status?.ffmpeg_path ?? "Not found")}</code>
            </div>
            <button class="install-button" id="install-ytdlp">Install / Update yt-dlp</button>
          </div>
        </section>
      </div>

      <div class="settings-actions">
        <button class="reset-button" id="reset-settings">Reset to Defaults</button>
        <button class="save-button" id="save-settings">Save Changes</button>
      </div>
    </section>
  `;
}

function wireEvents() {
  document.querySelectorAll<HTMLElement>("[data-route]").forEach((node) => {
    node.addEventListener("click", () => routeTo(node.dataset.route ?? "download"));
  });

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    state.themeMode = resolvedDark() ? "light" : "dark";
    render();
  });
  document.getElementById("notification-toggle")?.addEventListener("click", () => {
    state.showNotifications = !state.showNotifications;
    if (state.showNotifications) {
      state.notifications.forEach((item) => {
        item.read = true;
      });
    }
    savePersistedState();
    render();
  });
  document.getElementById("clear-notifications")?.addEventListener("click", () => {
    state.notifications = [];
    state.showNotifications = false;
    savePersistedState();
    render();
  });

  document.getElementById("refresh-status")?.addEventListener("click", refreshStatus);
  document.getElementById("install-ytdlp")?.addEventListener("click", installYtdlp);
  document.getElementById("browse-output")?.addEventListener("click", () => {
    setNotice("目录选择器下一步接入；当前可直接编辑 Output path。");
  });
  document.getElementById("save-settings")?.addEventListener("click", () => {
    state.settings.httpProxy = getInput("settings-http-proxy").trim();
    state.settings.defaultResolution = getInput("settings-resolution") || state.settings.defaultResolution;
    state.settings.downloadDir = getInput("settings-output-dir").trim() || (state.status?.default_download_dir ?? "");
    savePersistedState();
    setNotice("设置已保存到当前会话。");
  });
  document.getElementById("reset-settings")?.addEventListener("click", () => {
    state.settings.httpProxy = "";
    state.settings.defaultResolution = "1440";
    state.settings.downloadDir = "";
    savePersistedState();
    render();
    setNotice("已恢复默认设置。");
  });
  document.querySelectorAll<HTMLButtonElement>(".theme-option").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.dataset.theme;
      if (theme === "light" || theme === "dark" || theme === "auto") {
        state.themeMode = theme;
        savePersistedState();
      }
      render();
    });
  });
  document.getElementById("start-download")?.addEventListener("click", startDownload);
  document.querySelectorAll<HTMLButtonElement>(".cancel-job").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.job);
      if (job) {
        void cancelJob(job.backendJobId ?? job.id);
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".retry-job").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.job);
      if (job) {
        void retryJob(job);
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".open-library-folder").forEach((button) => {
    button.addEventListener("click", () => openPath(button.dataset.path ?? ""));
  });
  document.querySelectorAll<HTMLButtonElement>(".play-library-file").forEach((button) => {
    button.addEventListener("click", () => playFile(button.dataset.path ?? ""));
  });
  document.querySelectorAll<HTMLButtonElement>(".delete-library-item").forEach((button) => {
    button.addEventListener("click", () =>
      deleteLibraryItem(button.dataset.id ?? "", button.dataset.path ? button.dataset.path : null)
    );
  });
  document.getElementById("paste-url")?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      const input = document.getElementById("download-url") as HTMLInputElement | null;
      if (input) input.value = text;
      setNotice("剪贴板链接已粘贴。");
    } catch {
      setNotice("无法读取剪贴板。");
    }
  });
}

listen<DownloadEvent>("download-event", (event) => {
  const payload = event.payload;
  const job = state.jobs.find((item) => item.backendJobId === payload.job_id || item.id === payload.job_id);
  if (!job) return;

  const previousStatus = job.status;
  job.status = payload.status;
  job.message = payload.message;
  job.totalBytes = parseYtdlpSize(payload.message) ?? job.totalBytes;
  job.filePath = payload.file_path ?? job.filePath;
  if (typeof payload.size_bytes === "number") {
    job.totalBytes = payload.size_bytes;
  }
  if (payload.status === "completed" && !state.library.some((item) => item.id === job.id)) {
    state.library.unshift({
      id: job.id,
      title: titleFromUrl(job.url),
      quality: formatLabel(job.format),
      size: formatBytes(job.totalBytes ?? payload.size_bytes ?? 0),
      sizeBytes: job.totalBytes ?? payload.size_bytes ?? undefined,
      filePath: job.filePath,
      outputDir: job.outputDir,
      completedAt: new Date().toLocaleDateString()
    });
    savePersistedState();
    pushNotification("Download completed", titleFromUrl(job.url), "success");
  }
  if (payload.status === "failed" && previousStatus !== "failed") {
    pushNotification("Download failed", payload.message, "error");
  }
  if (payload.progress !== null) {
    job.progress = payload.progress;
  }
  savePersistedState();
  render();
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.themeMode === "auto") render();
});

async function bootstrap() {
  await loadPersistedState();
  render();
  refreshStatus().catch((error) => setNotice(`状态检测失败：${String(error)}`));
}

void bootstrap();
