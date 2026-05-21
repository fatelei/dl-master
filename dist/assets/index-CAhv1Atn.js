(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))i(o);new MutationObserver(o=>{for(const c of o)if(c.type==="childList")for(const h of c.addedNodes)h.tagName==="LINK"&&h.rel==="modulepreload"&&i(h)}).observe(document,{childList:!0,subtree:!0});function s(o){const c={};return o.integrity&&(c.integrity=o.integrity),o.referrerPolicy&&(c.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?c.credentials="include":o.crossOrigin==="anonymous"?c.credentials="omit":c.credentials="same-origin",c}function i(o){if(o.ep)return;o.ep=!0;const c=s(o);fetch(o.href,c)}})();function P(e,t=!1){return window.__TAURI_INTERNALS__.transformCallback(e,t)}async function u(e,t={},s){return window.__TAURI_INTERNALS__.invoke(e,t,s)}var $;(function(e){e.WINDOW_RESIZED="tauri://resize",e.WINDOW_MOVED="tauri://move",e.WINDOW_CLOSE_REQUESTED="tauri://close-requested",e.WINDOW_DESTROYED="tauri://destroyed",e.WINDOW_FOCUS="tauri://focus",e.WINDOW_BLUR="tauri://blur",e.WINDOW_SCALE_FACTOR_CHANGED="tauri://scale-change",e.WINDOW_THEME_CHANGED="tauri://theme-changed",e.WINDOW_CREATED="tauri://window-created",e.WINDOW_SUSPENDED="tauri://suspended",e.WINDOW_RESUMED="tauri://resumed",e.WEBVIEW_CREATED="tauri://webview-created",e.DRAG_ENTER="tauri://drag-enter",e.DRAG_OVER="tauri://drag-over",e.DRAG_DROP="tauri://drag-drop",e.DRAG_LEAVE="tauri://drag-leave"})($||($={}));async function k(e,t){window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(e,t),await u("plugin:event|unlisten",{event:e,eventId:t})}async function L(e,t,s){var i;const o=(i=void 0)!==null&&i!==void 0?i:{kind:"Any"};return u("plugin:event|listen",{event:e,target:o,handler:P(t)}).then(c=>async()=>k(e,c))}const a={route:"download",themeMode:"light",showNotifications:!1,settings:{httpProxy:"",defaultResolution:"1440",downloadDir:""},status:null,jobs:[],library:[],notifications:[]},b="dl-master.state.v1",B=document.querySelector("#app");if(!B)throw new Error("App root not found");const I=B;function N(e){a.route=e,d()}function R(){return window.matchMedia("(prefers-color-scheme: dark)").matches}function E(){return a.themeMode==="auto"?R():a.themeMode==="dark"}function n(e){return e.replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[t])}function S(e){return{best:"Best available",2160:"MP4 4K",1080:"MP4 1080p",720:"MP4 720p",audio:"MP3 audio"}[e]??e}function _(e){if(!Number.isFinite(e)||e<=0)return"0 B";const t=["B","KB","MB","GB","TB"];let s=e,i=0;for(;s>=1024&&i<t.length-1;)s/=1024,i+=1;return`${s>=10||i===0?s.toFixed(0):s.toFixed(1)} ${t[i]}`}function M(e){const t=e.match(/\bof\s+~?\s*([\d.]+)\s*([KMGT]i?B|B)\b/i);if(!t)return null;const s=Number.parseFloat(t[1]);if(!Number.isFinite(s))return null;const i=t[2].toUpperCase(),o={B:1,KB:1e3,KIB:1024,MB:1e3**2,MIB:1024**2,GB:1e3**3,GIB:1024**3,TB:1e3**4,TIB:1024**4};return Math.round(s*(o[i]??1))}function A(e){const t=e.match(/^\s*([\d.]+)\s*([KMGT]?i?B)\s*$/i);if(!t)return 0;const s=Number.parseFloat(t[1]);if(!Number.isFinite(s))return 0;const i=t[2].toUpperCase(),o={B:1,KB:1e3,KIB:1024,MB:1e3**2,MIB:1024**2,GB:1e3**3,GIB:1024**3,TB:1e3**4,TIB:1024**4};return Math.round(s*(o[i]??1))}function x(){const e=a.library.reduce((t,s)=>t+(s.sizeBytes??A(s.size)),0);return{completedJobs:a.library.length,completedBytes:e}}function p(e,t,s="info"){a.notifications.unshift({id:crypto.randomUUID(),title:e,body:t,kind:s,read:!1,createdAt:new Date().toLocaleTimeString()}),a.notifications=a.notifications.slice(0,30),l()}function q(){return a.notifications.filter(e=>!e.read).length}async function O(){const e=await u("load_persisted_state");(e.theme_mode==="light"||e.theme_mode==="dark"||e.theme_mode==="auto")&&(a.themeMode=e.theme_mode),e.settings&&(a.settings.httpProxy=typeof e.settings.http_proxy=="string"?e.settings.http_proxy:a.settings.httpProxy,a.settings.defaultResolution=typeof e.settings.default_resolution=="string"?e.settings.default_resolution:a.settings.defaultResolution,a.settings.downloadDir=typeof e.settings.download_dir=="string"?e.settings.download_dir:a.settings.downloadDir),Array.isArray(e.jobs)&&(a.jobs=e.jobs.filter(t=>t&&typeof t.id=="string"&&typeof t.url=="string").map(t=>({id:t.id,backendJobId:typeof t.backend_job_id=="string"?t.backend_job_id:t.backend_job_id??t.id,url:t.url,format:t.format,outputDir:t.output_dir,archive:!!t.archive,subtitles:!!t.subtitles,playlist:!!t.playlist,proxy:typeof t.proxy=="string"?t.proxy:t.proxy??null,attempts:typeof t.attempts=="number"&&Number.isFinite(t.attempts)?t.attempts:1,status:t.status,progress:typeof t.progress=="number"?t.progress:0,totalBytes:typeof t.total_bytes=="number"?t.total_bytes:null,filePath:typeof t.file_path=="string"?t.file_path:t.file_path??null,message:t.message,startedAt:t.started_at}))),Array.isArray(e.library)&&(a.library=e.library.filter(t=>t&&typeof t.id=="string"&&typeof t.title=="string").map(t=>({id:t.id,title:t.title,quality:t.quality,size:t.size,sizeBytes:typeof t.size_bytes=="number"?t.size_bytes:void 0,filePath:typeof t.file_path=="string"?t.file_path:t.file_path??null,outputDir:t.output_dir,completedAt:t.completed_at}))),Array.isArray(e.notifications)&&(a.notifications=e.notifications.filter(t=>t&&typeof t.id=="string"&&typeof t.title=="string").map(t=>({id:t.id,title:t.title,body:t.body,kind:t.kind,read:t.read,createdAt:t.created_at}))),a.library.length===0&&C()}function l(){const e={theme_mode:a.themeMode,settings:{http_proxy:a.settings.httpProxy,default_resolution:a.settings.defaultResolution,download_dir:a.settings.downloadDir},jobs:a.jobs.map(t=>({id:t.id,backend_job_id:t.backendJobId,url:t.url,format:t.format,output_dir:t.outputDir,archive:t.archive,subtitles:t.subtitles,playlist:t.playlist,proxy:t.proxy,attempts:t.attempts,status:t.status,progress:t.progress,total_bytes:t.totalBytes,file_path:t.filePath,message:t.message,started_at:t.startedAt})),library:a.library.map(t=>({id:t.id,title:t.title,quality:t.quality,size:t.size,size_bytes:t.sizeBytes,file_path:t.filePath,output_dir:t.outputDir,completed_at:t.completedAt})),notifications:a.notifications.map(t=>({id:t.id,title:t.title,body:t.body,kind:t.kind,read:t.read,created_at:t.createdAt}))};u("save_persisted_state",{state:e}).catch(t=>{console.error("Failed to persist state",t)})}function C(){try{const e=window.localStorage.getItem(b);if(!e)return;const t=JSON.parse(e);(t.themeMode==="light"||t.themeMode==="dark"||t.themeMode==="auto")&&(a.themeMode=t.themeMode),t.settings&&(typeof t.settings.httpProxy=="string"&&(a.settings.httpProxy=t.settings.httpProxy),typeof t.settings.defaultResolution=="string"&&(a.settings.defaultResolution=t.settings.defaultResolution),typeof t.settings.downloadDir=="string"&&(a.settings.downloadDir=t.settings.downloadDir)),Array.isArray(t.library)&&(a.library=t.library.filter(s=>s&&typeof s.id=="string"&&typeof s.title=="string")),Array.isArray(t.jobs)&&(a.jobs=t.jobs.filter(s=>s&&typeof s.id=="string"&&typeof s.url=="string").map(s=>({id:s.id,backendJobId:s.id,url:s.url,format:s.format??"best",outputDir:s.outputDir??"",archive:!!s.archive,subtitles:!!s.subtitles,playlist:!!s.playlist,proxy:typeof s.proxy=="string"?s.proxy:s.proxy??null,attempts:typeof s.attempts=="number"&&Number.isFinite(s.attempts)?s.attempts:1,status:s.status??"failed",progress:typeof s.progress=="number"?s.progress:0,totalBytes:typeof s.totalBytes=="number"?s.totalBytes:null,filePath:typeof s.filePath=="string"?s.filePath:s.filePath??null,message:s.message??"",startedAt:s.startedAt??new Date().toLocaleString()}))),Array.isArray(t.notifications)&&(a.notifications=t.notifications.filter(s=>s&&typeof s.id=="string"&&typeof s.title=="string")),window.localStorage.removeItem(b),l()}catch{window.localStorage.removeItem(b)}}async function D(){a.status=await u("app_status"),d()}function W(){return{url:f("download-url").trim(),outputDir:f("output-dir").trim()||a.settings.downloadDir.trim()||(a.status?.default_download_dir??""),format:f("format-select"),archive:v("archive-toggle"),subtitles:v("subtitle-toggle"),playlist:v("playlist-toggle"),proxy:a.settings.httpProxy.trim()||null}}async function z(){r("正在下载 yt-dlp 到应用数据目录...");try{await u("install_ytdlp"),await D(),p("yt-dlp installed","Managed yt-dlp is ready to use.","success"),l(),r("yt-dlp 已安装，可以开始下载。")}catch(e){p("yt-dlp install failed",String(e),"error"),r(`安装失败：${String(e)}`)}}async function U(){const e=W();if(!e.url){r("请输入视频或播放列表 URL。");return}try{const t=await u("start_download",{request:{url:e.url,format:e.format,output_dir:e.outputDir,archive:e.archive,subtitles:e.subtitles,playlist:e.playlist,proxy:e.proxy}});a.jobs.unshift({id:t.job_id,backendJobId:t.job_id,url:e.url,format:e.format,outputDir:e.outputDir,archive:e.archive,subtitles:e.subtitles,playlist:e.playlist,proxy:e.proxy,attempts:1,status:"queued",progress:0,totalBytes:null,filePath:null,message:"Queued",startedAt:new Date().toLocaleString()}),p("Download started",y(e.url),"info"),l(),a.route="queue",d()}catch(t){p("Download failed to start",String(t),"error"),r(`无法启动下载：${String(t)}`)}}async function T(e){try{const t=await u("start_download",{request:{url:e.url,format:e.format,output_dir:e.outputDir,archive:e.archive,subtitles:e.subtitles,playlist:e.playlist,proxy:e.proxy}});e.backendJobId=t.job_id,e.attempts+=1,e.status="queued",e.progress=0,e.totalBytes=null,e.filePath=null,e.message="Queued for retry",e.startedAt=new Date().toLocaleString(),p("Retry started",y(e.url),"info"),l(),a.route="queue",d()}catch(t){p("Retry failed",String(t),"error"),r(`重试失败：${String(t)}`)}}async function j(e){try{await u("open_path",{path:e})}catch(t){r(`无法打开路径：${String(t)}`)}}async function F(e){try{await u("play_path",{path:e})}catch(t){r(`无法播放文件：${String(t)}`)}}async function G(e,t){const s=a.library.find(i=>i.id===e);if(s)try{await u("delete_library_item",{id:e,file_path:t}),a.library=a.library.filter(i=>i.id!==e),l(),d(),p("Library item deleted",s.title,"info"),r("Library item removed.")}catch(i){p("Library delete failed",String(i),"error"),r(`Delete failed: ${String(i)}`)}}function y(e){try{const t=new URL(e);return t.hostname.replace(/^www\./,"")+t.pathname}catch{return e}}async function K(e){try{await u("cancel_download",{jobId:e});const t=a.jobs.find(s=>s.id===e);t&&(t.status="failed",t.message="Cancelled by user",p("Download cancelled",y(t.url),"error"),l()),d()}catch(t){r(`取消失败：${String(t)}`)}}function f(e){return document.getElementById(e)?.value??""}function v(e){return!!document.getElementById(e)?.checked}function r(e){const t=document.querySelector(".notice");t&&(t.textContent=e,t.classList.add("notice--visible"),window.setTimeout(()=>t.classList.remove("notice--visible"),4200))}function d(){const e=E(),t=q();document.documentElement.classList.toggle("dark",e),I.innerHTML=`
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
        ${g("download","Download","download")}
        ${g("queue","Queue","pending_actions")}
        ${g("library","Library","video_library")}
        ${g("settings","Settings","settings")}
      </nav>
      <div class="profile-card">
        <div class="avatar">DM</div>
        <div>
          <strong>${a.status?.ytdlp_available?"yt-dlp Ready":"yt-dlp Missing"}</strong>
          <small>${a.status?.ffmpeg_available?"ffmpeg detected":"ffmpeg optional"}</small>
        </div>
      </div>
    </aside>
    <main class="shell">
      <header class="topbar">
        ${J()}
        <div class="topbar-actions">
          <button class="icon-button" id="refresh-status">sync</button>
          <button class="icon-button notification ${t>0?"has-unread":""}" id="notification-toggle">notifications</button>
          <button class="icon-button" id="theme-toggle">${e?"light_mode":"dark_mode"}</button>
        </div>
        ${a.showNotifications?H():""}
      </header>
      ${Q()}
    </main>
    <div class="notice"></div>
  `,tt()}function J(){return a.route==="library"?'<div class="search-box"><span>search</span><input placeholder="Search your library..." /></div>':a.route==="settings"?'<h2>Settings</h2><div class="settings-search"><span>search</span><input placeholder="Search settings..." /></div>':"<h2>Download Manager</h2>"}function g(e,t,s){return`<button class="nav-item ${a.route===e?"active":""}" data-route="${e}"><span>${s}</span>${t}</button>`}function H(){return a.notifications.length===0?`
      <section class="notification-panel">
        <div class="notification-panel-header">
          <strong>Notifications</strong>
          <button id="clear-notifications">Clear</button>
        </div>
        <div class="notification-empty">No notifications yet.</div>
      </section>
    `:`
    <section class="notification-panel">
      <div class="notification-panel-header">
        <strong>Notifications</strong>
        <button id="clear-notifications">Clear</button>
      </div>
      <div class="notification-list">
        ${a.notifications.map(e=>`
              <article class="notification-item ${e.kind} ${e.read?"read":"unread"}">
                <div>
                  <strong>${n(e.title)}</strong>
                  <p>${n(e.body)}</p>
                </div>
                <time>${n(e.createdAt)}</time>
              </article>
            `).join("")}
      </div>
    </section>
  `}function Q(){return a.route==="queue"?Y():a.route==="library"?Z():a.route==="settings"?X():V()}function V(){const e=a.settings.downloadDir.trim()||(a.status?.default_download_dir??""),t=x();return`
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
              <option value="2160" ${a.settings.defaultResolution==="2160"?"selected":""}>MP4 4K</option>
              <option value="1440" ${a.settings.defaultResolution==="1440"?"selected":""}>MP4 1440p</option>
              <option value="1080" ${a.settings.defaultResolution==="1080"?"selected":""}>MP4 1080p</option>
              <option value="720" ${a.settings.defaultResolution==="720"?"selected":""}>MP4 720p</option>
              <option value="audio">MP3 High (320kbps)</option>
              <option value="best" ${a.settings.defaultResolution==="best"?"selected":""}>Best Available</option>
            </select>
          </div>
          <button class="download-button" id="start-download" ${a.status?.ytdlp_available?"":"disabled"}>
            <span>${a.status?.ytdlp_available?"download":"block"}</span>
            Download
          </button>
        </div>
        <div class="advanced-row">
          <label class="output-field">Output directory <input id="output-dir" value="${n(e)}" /></label>
          ${w("archive-toggle","Archive downloaded IDs",!0)}
          ${w("subtitle-toggle","Auto subtitles",!1)}
          ${w("playlist-toggle","Allow playlist",!1)}
        </div>
        ${a.status?.ytdlp_available?"":'<button class="install-button" id="install-ytdlp">Install yt-dlp</button>'}
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
          <strong>${_(t.completedBytes)}</strong>
          <p>${t.completedJobs} saved in library</p>
          <button data-route="queue">View Queue</button>
        </article>

        ${m("auto_awesome","Smart Format Detection","DL Master automatically analyzes the source to offer the highest available resolution up to 8K.")}
        ${m("playlist_add_check","Playlist Downloads","Paste a playlist link to capture multiple videos at once. Queue them for efficient downloading.")}
        ${m("bolt","Turbo Engine","yt-dlp progress is streamed from Rust to the desktop dashboard in real time.")}
      </div>

      <footer class="footer-line">
        <span>Engine: ${n(a.status?.ytdlp_path??"yt-dlp not found")}</span>
        <span>Proxy: Disabled</span>
      </footer>
    </section>
  `}function m(e,t,s){return`
    <article class="feature-card">
      <div>${e}</div>
      <h5>${t}</h5>
      <p>${s}</p>
    </article>
  `}function w(e,t,s){return`
    <label class="switch-row">
      <input id="${e}" type="checkbox" ${s?"checked":""} />
      <span>${t}</span>
    </label>
  `}function Y(){return a.jobs.length===0?`
      <section class="empty-state">
        <div class="empty-icon">▦</div>
        <h3>No active jobs</h3>
        <p>Start a download and progress will appear here.</p>
        <button class="new-download compact" data-route="download">New Download</button>
      </section>
    `:`
    <section class="queue-list">
      ${a.jobs.map(e=>`
          <article class="job-card">
            <div>
              <div class="job-meta">
                <span>${n(S(e.format))}</span>
                <span>${n(e.startedAt)}</span>
              </div>
              <h3>${n(e.url)}</h3>
              <p>${n(e.message)}</p>
            </div>
            <div class="job-side">
              <strong class="status-${e.status}">${e.status}</strong>
              <small>Attempt ${e.attempts}</small>
              <div class="progress"><span style="width:${Math.max(0,Math.min(100,e.progress))}%"></span></div>
              <div class="job-actions">
                ${e.status==="failed"?`<button class="ghost retry-job" data-job="${e.id}">Retry</button>`:""}
                ${e.status==="running"||e.status==="queued"?`<button class="ghost cancel-job" data-job="${e.id}">Cancel</button>`:""}
              </div>
            </div>
          </article>
        `).join("")}
    </section>
  `}function Z(){return a.library.length===0?`
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
    `:`
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
      ${a.library.map((e,t)=>`
          <article class="video-card">
            <div class="thumb thumb-${t+1}">
              <span>${n(e.completedAt)}</span>
            </div>
            <div class="video-body">
              <h3>${n(e.title)}</h3>
              <div><span>${n(e.quality)}</span><span>${n(_(e.sizeBytes??A(e.size)))}</span></div>
              <div class="library-card-actions">
                <button class="play-library-file" data-path="${n(e.filePath??"")}" ${e.filePath?"":"disabled"} aria-label="Play"><span>play_arrow</span></button>
                <button class="open-library-folder" data-path="${n(e.outputDir)}" aria-label="Open folder"><span>folder_open</span></button>
                <button class="delete-library-item" data-id="${n(e.id)}" data-path="${n(e.filePath??"")}" aria-label="Delete library item" title="Delete"><span>delete</span></button>
              </div>
            </div>
          </article>
        `).join("")}
    </section>
  `}function X(){const e=a.status,t=a.settings.downloadDir.trim()||(e?.default_download_dir??""),s=a.settings.defaultResolution;return`
    <section class="settings-page">
      <div class="settings-content">
        <section class="settings-group">
          <h3><span>tune</span>General</h3>
          <div class="settings-card">
            <div class="setting-field">
              <strong>Theme</strong>
              <div class="theme-grid">
                <button class="theme-option ${a.themeMode==="light"?"selected":""}" data-theme="light"><span>light_mode</span><b>Light</b></button>
                <button class="theme-option ${a.themeMode==="dark"?"selected":""}" data-theme="dark"><span>dark_mode</span><b>Dark</b></button>
                <button class="theme-option ${a.themeMode==="auto"?"selected":""}" data-theme="auto"><span>settings_suggest</span><b>Auto</b></button>
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
                <input id="settings-output-dir" value="${n(t)}" />
                <button id="browse-output">Browse</button>
              </div>
            </label>

            <label class="setting-field">
              <strong>Default resolution</strong>
              <select id="settings-resolution">
                <option value="2160" ${s==="2160"?"selected":""}>4K (2160p) - Ultra Quality</option>
                <option value="1440" ${s==="1440"?"selected":""}>2K (1440p) - High Quality</option>
                <option value="1080" ${s==="1080"?"selected":""}>1080p - Standard HD</option>
                <option value="720" ${s==="720"?"selected":""}>720p - Compact</option>
                <option value="best" ${s==="best"?"selected":""}>Best available</option>
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
              <input id="settings-http-proxy" class="settings-input" value="${n(a.settings.httpProxy)}" placeholder="http://127.0.0.1:7890" />
              <small>Optional. When set, downloads are launched with yt-dlp <code>--proxy</code>.</small>
            </label>
            <div>
              <strong>yt-dlp</strong>
              <code>${n(e?.ytdlp_path??"Not found")}</code>
            </div>
            <div>
              <strong>Managed yt-dlp path</strong>
              <code>${n(e?.managed_ytdlp_path??"")}</code>
            </div>
            <div>
              <strong>ffmpeg</strong>
              <code>${n(e?.ffmpeg_path??"Not found")}</code>
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
  `}function tt(){document.querySelectorAll("[data-route]").forEach(e=>{e.addEventListener("click",()=>N(e.dataset.route??"download"))}),document.getElementById("theme-toggle")?.addEventListener("click",()=>{a.themeMode=E()?"light":"dark",d()}),document.getElementById("notification-toggle")?.addEventListener("click",()=>{a.showNotifications=!a.showNotifications,a.showNotifications&&a.notifications.forEach(e=>{e.read=!0}),l(),d()}),document.getElementById("clear-notifications")?.addEventListener("click",()=>{a.notifications=[],a.showNotifications=!1,l(),d()}),document.getElementById("refresh-status")?.addEventListener("click",D),document.getElementById("install-ytdlp")?.addEventListener("click",z),document.getElementById("browse-output")?.addEventListener("click",()=>{r("目录选择器下一步接入；当前可直接编辑 Output path。")}),document.getElementById("save-settings")?.addEventListener("click",()=>{a.settings.httpProxy=f("settings-http-proxy").trim(),a.settings.defaultResolution=f("settings-resolution")||a.settings.defaultResolution,a.settings.downloadDir=f("settings-output-dir").trim()||(a.status?.default_download_dir??""),l(),r("设置已保存到当前会话。")}),document.getElementById("reset-settings")?.addEventListener("click",()=>{a.settings.httpProxy="",a.settings.defaultResolution="1440",a.settings.downloadDir="",l(),d(),r("已恢复默认设置。")}),document.querySelectorAll(".theme-option").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.theme;(t==="light"||t==="dark"||t==="auto")&&(a.themeMode=t,l()),d()})}),document.getElementById("start-download")?.addEventListener("click",U),document.querySelectorAll(".cancel-job").forEach(e=>{e.addEventListener("click",()=>{const t=a.jobs.find(s=>s.id===e.dataset.job);t&&K(t.backendJobId??t.id)})}),document.querySelectorAll(".retry-job").forEach(e=>{e.addEventListener("click",()=>{const t=a.jobs.find(s=>s.id===e.dataset.job);t&&T(t)})}),document.querySelectorAll(".open-library-folder").forEach(e=>{e.addEventListener("click",()=>j(e.dataset.path??""))}),document.querySelectorAll(".play-library-file").forEach(e=>{e.addEventListener("click",()=>F(e.dataset.path??""))}),document.querySelectorAll(".delete-library-item").forEach(e=>{e.addEventListener("click",()=>G(e.dataset.id??"",e.dataset.path?e.dataset.path:null))}),document.getElementById("paste-url")?.addEventListener("click",async()=>{try{const e=await navigator.clipboard.readText(),t=document.getElementById("download-url");t&&(t.value=e),r("剪贴板链接已粘贴。")}catch{r("无法读取剪贴板。")}})}L("download-event",e=>{const t=e.payload,s=a.jobs.find(o=>o.backendJobId===t.job_id||o.id===t.job_id);if(!s)return;const i=s.status;s.status=t.status,s.message=t.message,s.totalBytes=M(t.message)??s.totalBytes,s.filePath=t.file_path??s.filePath,typeof t.size_bytes=="number"&&(s.totalBytes=t.size_bytes),t.status==="completed"&&!a.library.some(o=>o.id===s.id)&&(a.library.unshift({id:s.id,title:y(s.url),quality:S(s.format),size:_(s.totalBytes??t.size_bytes??0),sizeBytes:s.totalBytes??t.size_bytes??void 0,filePath:s.filePath,outputDir:s.outputDir,completedAt:new Date().toLocaleDateString()}),l(),p("Download completed",y(s.url),"success")),t.status==="failed"&&i!=="failed"&&p("Download failed",t.message,"error"),t.progress!==null&&(s.progress=t.progress),l(),d()});window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{a.themeMode==="auto"&&d()});async function et(){await O(),d(),D().catch(e=>r(`状态检测失败：${String(e)}`))}et();
