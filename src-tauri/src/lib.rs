use serde::{Deserialize, Serialize};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    convert::TryFrom,
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[derive(Default)]
struct AppState {
    jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    job_outputs: Arc<Mutex<HashMap<String, PathBuf>>>,
}

#[derive(Debug, Serialize)]
struct ToolStatus {
    ytdlp_available: bool,
    ytdlp_path: Option<String>,
    ffmpeg_available: bool,
    ffmpeg_path: Option<String>,
    managed_ytdlp_path: String,
    default_download_dir: String,
}

#[derive(Debug, Deserialize)]
struct DownloadRequest {
    url: String,
    format: String,
    output_dir: String,
    archive: bool,
    subtitles: bool,
    playlist: bool,
    proxy: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct DownloadEvent {
    job_id: String,
    status: String,
    message: String,
    progress: Option<f32>,
    file_path: Option<String>,
    size_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
struct StartedJob {
    job_id: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct PersistedState {
    theme_mode: Option<String>,
    settings: Option<PersistedSettings>,
    jobs: Option<Vec<PersistedJobItem>>,
    library: Option<Vec<PersistedLibraryItem>>,
    notifications: Option<Vec<PersistedNotification>>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct PersistedSettings {
    http_proxy: Option<String>,
    default_resolution: Option<String>,
    download_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct PersistedJobItem {
    #[serde(default)]
    id: String,
    #[serde(default)]
    backend_job_id: Option<String>,
    #[serde(default)]
    url: String,
    #[serde(default)]
    format: String,
    #[serde(default)]
    output_dir: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    progress: Option<f32>,
    #[serde(default)]
    total_bytes: Option<u64>,
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default)]
    message: String,
    #[serde(default)]
    started_at: String,
    #[serde(default)]
    archive: bool,
    #[serde(default)]
    subtitles: bool,
    #[serde(default)]
    playlist: bool,
    #[serde(default)]
    proxy: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct PersistedLibraryItem {
    id: String,
    title: String,
    quality: String,
    size: String,
    size_bytes: Option<u64>,
    file_path: Option<String>,
    output_dir: String,
    completed_at: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct PersistedNotification {
    id: String,
    title: String,
    body: String,
    kind: String,
    read: bool,
    created_at: String,
}

#[tauri::command]
fn app_status(app: AppHandle) -> Result<ToolStatus, String> {
    let managed = managed_ytdlp_path(&app)?;
    let ytdlp_path = find_ytdlp(&app).map(|path| path.display().to_string());
    let ffmpeg_path = find_ffmpeg().map(|path| path.display().to_string());
    let default_download_dir = default_download_dir(&app)?.display().to_string();

    Ok(ToolStatus {
        ytdlp_available: ytdlp_path.is_some(),
        ytdlp_path,
        ffmpeg_available: ffmpeg_path.is_some(),
        ffmpeg_path,
        managed_ytdlp_path: managed.display().to_string(),
        default_download_dir,
    })
}

#[tauri::command]
fn load_persisted_state(app: AppHandle) -> Result<PersistedState, String> {
    let mut conn = open_state_db(&app)?;
    let mut state = load_state_from_db(&conn)?;

    if state.is_empty() {
      if let Some(legacy) = load_legacy_state(&app)? {
          save_state_to_db(&mut conn, &legacy)?;
          state = legacy;
      }
    }

    Ok(state)
}

#[tauri::command]
fn save_persisted_state(app: AppHandle, state: PersistedState) -> Result<(), String> {
    let mut conn = open_state_db(&app)?;
    save_state_to_db(&mut conn, &state)
}

#[tauri::command]
fn install_ytdlp(app: AppHandle) -> Result<String, String> {
    let url = if cfg!(windows) {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    };
    let target = managed_ytdlp_path(&app)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Cannot create tool dir: {err}"))?;
    }

    let bytes = reqwest::blocking::get(url)
        .map_err(|err| format!("Cannot download yt-dlp: {err}"))?
        .error_for_status()
        .map_err(|err| format!("yt-dlp download failed: {err}"))?
        .bytes()
        .map_err(|err| format!("Cannot read yt-dlp download: {err}"))?;

    fs::write(&target, bytes).map_err(|err| format!("Cannot write yt-dlp: {err}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&target)
            .map_err(|err| format!("Cannot inspect yt-dlp: {err}"))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&target, permissions)
            .map_err(|err| format!("Cannot make yt-dlp executable: {err}"))?;
    }

    Ok(target.display().to_string())
}

#[tauri::command]
fn start_download(
    app: AppHandle,
    state: State<AppState>,
    request: DownloadRequest,
) -> Result<StartedJob, String> {
    if request.url.trim().is_empty() {
        return Err("URL cannot be empty".into());
    }

    let ytdlp = find_ytdlp(&app).ok_or_else(|| "yt-dlp is not installed".to_string())?;
    let ffmpeg = find_ffmpeg();
    let output_dir = PathBuf::from(request.output_dir.trim());
    fs::create_dir_all(&output_dir).map_err(|err| format!("Cannot create output dir: {err}"))?;

    let job_id = Uuid::new_v4().to_string();
    let mut args = format_args_for_request(&request, &output_dir, ffmpeg.as_ref());
    args.push(request.url.trim().to_string());

    let mut child = Command::new(ytdlp)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Cannot start yt-dlp: {err}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    state
        .jobs
        .lock()
        .map_err(|_| "Job registry is unavailable".to_string())?
        .insert(job_id.clone(), Arc::clone(&child));

    let outputs = Arc::clone(&state.job_outputs);
    if let Some(stdout) = stdout {
        pipe_reader(
            app.clone(),
            job_id.clone(),
            output_dir.clone(),
            Arc::clone(&outputs),
            stdout,
            "running",
        );
    }
    if let Some(stderr) = stderr {
        pipe_reader(
            app.clone(),
            job_id.clone(),
            output_dir.clone(),
            Arc::clone(&outputs),
            stderr,
            "warning",
        );
    }

    let jobs = Arc::clone(&state.jobs);
    let finish_outputs = Arc::clone(&state.job_outputs);
    let finish_app = app.clone();
    let finish_job_id = job_id.clone();
    thread::spawn(move || {
        let exit = child.lock().ok().and_then(|mut child| child.wait().ok());
        if let Ok(mut jobs) = jobs.lock() {
            jobs.remove(&finish_job_id);
        }
        let file_path = finish_outputs
            .lock()
            .ok()
            .and_then(|mut outputs| outputs.remove(&finish_job_id));
        let resolved_path = file_path.or_else(|| find_latest_media_file(&output_dir));
        let size_bytes = resolved_path
            .as_ref()
            .and_then(|path| fs::metadata(path).ok())
            .map(|metadata| metadata.len());

        let (status, message) = match exit.and_then(|status| status.code()) {
            Some(0) => ("completed", "Download completed".to_string()),
            Some(code) => ("failed", format!("yt-dlp exited with code {code}")),
            None => ("failed", "yt-dlp process ended unexpectedly".to_string()),
        };
        emit_download_event(
            &finish_app,
            &finish_job_id,
            status,
            message,
            Some(100.0),
            resolved_path,
            size_bytes,
        );
    });

    emit_download_event(
        &app,
        &job_id,
        "queued",
        "Download job started".to_string(),
        Some(0.0),
        None,
        None,
    );

    Ok(StartedJob { job_id })
}

#[tauri::command]
fn cancel_download(state: State<AppState>, job_id: String) -> Result<(), String> {
    let child = state
        .jobs
        .lock()
        .map_err(|_| "Job registry is unavailable".to_string())?
        .remove(&job_id);

    if let Some(child) = child {
        child
            .lock()
            .map_err(|_| "Download process is unavailable".to_string())?
            .kill()
            .map_err(|err| format!("Cannot cancel job: {err}"))?;
        Ok(())
    } else {
        Err("Job is no longer running".into())
    }
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if !path.exists() {
        return Err("Path does not exist".into());
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&path);
        command
    };

    command
        .spawn()
        .map_err(|err| format!("Cannot open path: {err}"))?;
    Ok(())
}

#[tauri::command]
fn play_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if !path.exists() || !path.is_file() {
        return Err("Media file does not exist".into());
    }

    if let Some(player) = find_player_binary() {
        Command::new(player)
            .arg(&path)
            .spawn()
            .map_err(|err| format!("Cannot open media player: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        if Command::new("open")
            .args(["-a", "QuickTime Player", path.to_string_lossy().as_ref()])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
    }

    open_path(path.display().to_string())
}

#[tauri::command]
fn delete_library_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if path.as_os_str().is_empty() || !path.exists() {
        return Ok(());
    }

    if !path.is_file() {
        return Err("Only files can be deleted from the library".into());
    }

    fs::remove_file(&path).map_err(|err| format!("Cannot delete file: {err}"))?;
    Ok(())
}

#[tauri::command]
fn delete_library_item(app: AppHandle, id: String, file_path: Option<String>) -> Result<(), String> {
    if let Some(path) = file_path.as_ref() {
        let path = PathBuf::from(path.trim());
        if path.exists() && path.is_file() {
            fs::remove_file(&path).map_err(|err| format!("Cannot delete file: {err}"))?;
        }
    }

    let conn = open_state_db(&app)?;
    conn.execute("DELETE FROM library WHERE id = ?", params![id])
        .map_err(|err| format!("Cannot delete library item: {err}"))?;
    Ok(())
}

fn pipe_reader<R: std::io::Read + Send + 'static>(
    app: AppHandle,
    job_id: String,
    output_dir: PathBuf,
    outputs: Arc<Mutex<HashMap<String, PathBuf>>>,
    reader: R,
    status: &'static str,
) {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines().map_while(Result::ok) {
            let progress = parse_progress(&line);
            let file_path = parse_output_path(&line, &output_dir);
            if let Some(file_path) = file_path.clone() {
                if let Ok(mut outputs) = outputs.lock() {
                    outputs.insert(job_id.clone(), file_path.clone());
                }
            }
            emit_download_event(&app, &job_id, status, line, progress, file_path, None);
        }
    });
}

fn emit_download_event(
    app: &AppHandle,
    job_id: &str,
    status: &str,
    message: String,
    progress: Option<f32>,
    file_path: Option<PathBuf>,
    size_bytes: Option<u64>,
) {
    let _ = app.emit(
        "download-event",
        DownloadEvent {
            job_id: job_id.to_string(),
            status: status.to_string(),
            message,
            progress,
            file_path: file_path.map(|path| path.display().to_string()),
            size_bytes,
        },
    );
}

fn parse_output_path(line: &str, output_dir: &Path) -> Option<PathBuf> {
    const MARKERS: [&str; 5] = [
        "[download] Destination: ",
        "[Merger] Merging formats into \"",
        "[ExtractAudio] Destination: ",
        "[VideoConvertor] Converting video from ",
        "[MoveFiles] Moving file \"",
    ];

    for marker in MARKERS {
        if let Some(value) = line.strip_prefix(marker) {
            let raw = value.trim().trim_end_matches('"');
            let path = PathBuf::from(raw);
            return Some(if path.is_absolute() {
                path
            } else {
                output_dir.join(path)
            });
        }
    }

    let candidate = PathBuf::from(line.trim());
    if candidate.is_file() {
        return Some(candidate);
    }

    None
}

fn parse_progress(line: &str) -> Option<f32> {
    let marker = "[download]";
    if !line.contains(marker) {
        return None;
    }

    let percent_index = line.find('%')?;
    let before_percent = &line[..percent_index];
    let token = before_percent.split_whitespace().last()?;
    token.parse::<f32>().ok()
}

fn find_latest_media_file(output_dir: &Path) -> Option<PathBuf> {
    const MEDIA_EXTENSIONS: [&str; 10] = [
        "mp4", "mkv", "webm", "m4v", "mov", "avi", "mp3", "m4a", "opus", "flac",
    ];

    let entries = fs::read_dir(output_dir).ok()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;

    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if name == "archive.txt" {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());

        if !extension
            .as_deref()
            .is_some_and(|ext| MEDIA_EXTENSIONS.contains(&ext))
        {
            continue;
        }

        let modified = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())?;

        match &best {
            Some((current_modified, _)) if *current_modified >= modified => {}
            _ => best = Some((modified, path)),
        }
    }

    best.map(|(_, path)| path)
}

fn format_args_for_request(
    request: &DownloadRequest,
    output_dir: &Path,
    ffmpeg: Option<&PathBuf>,
) -> Vec<String> {
    let mut args = vec![
        "--newline".to_string(),
        "--progress".to_string(),
        "--no-color".to_string(),
        "--restrict-filenames".to_string(),
        "--print".to_string(),
        "after_move:filepath".to_string(),
        "-P".to_string(),
        output_dir.display().to_string(),
        "-o".to_string(),
        "%(title).200s [%(id)s].%(ext)s".to_string(),
    ];

    if let Some(ffmpeg) = ffmpeg.and_then(|path| path.parent()) {
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg.display().to_string());
    }
    args.push("--no-keep-video".to_string());
    args.push("--no-keep-fragments".to_string());

    if !request.playlist {
        args.push("--no-playlist".to_string());
    }
    if request.archive {
        args.push("--download-archive".to_string());
        args.push(output_dir.join("archive.txt").display().to_string());
    }
    if request.subtitles {
        args.push("--write-auto-subs".to_string());
        args.push("--sub-langs".to_string());
        args.push("all,-live_chat".to_string());
    }
    if let Some(proxy) = request
        .proxy
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        args.push("--proxy".to_string());
        args.push(proxy.to_string());
    }

    match request.format.as_str() {
        "audio" => {
            args.extend([
                "-x".to_string(),
                "--audio-format".to_string(),
                "mp3".to_string(),
                "--audio-quality".to_string(),
                "0".to_string(),
            ]);
        }
        "best" => args.extend([
            "-f".to_string(),
            "bv*+ba/b".to_string(),
            "--merge-output-format".to_string(),
            "mp4".to_string(),
        ]),
        quality => args.extend([
            "-f".to_string(),
            format!("bv*[height<={quality}]+ba/b[height<={quality}]/b"),
            "--merge-output-format".to_string(),
            "mp4".to_string(),
        ]),
    }

    args
}

fn find_ytdlp(app: &AppHandle) -> Option<PathBuf> {
    managed_ytdlp_path(app)
        .ok()
        .filter(|path| is_executable_file(path))
        .or_else(|| which::which("yt-dlp").ok())
        .or_else(|| find_in_common_tool_dirs(ytdlp_file_name()))
}

fn find_ffmpeg() -> Option<PathBuf> {
    which::which("ffmpeg")
        .ok()
        .or_else(|| find_in_common_tool_dirs(ffmpeg_file_name()))
}

fn find_in_common_tool_dirs(file_name: &str) -> Option<PathBuf> {
    common_tool_dirs()
        .into_iter()
        .map(|dir| dir.join(file_name))
        .find(|path| is_executable_file(path))
}

fn common_tool_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(home) = home_dir() {
        dirs.extend([
            home.join(".local").join("bin"),
            home.join(".cargo").join("bin"),
            home.join("bin"),
        ]);

        #[cfg(windows)]
        dirs.extend([
            home.join("scoop").join("shims"),
            home.join("AppData")
                .join("Roaming")
                .join("Python")
                .join("Scripts"),
            home.join("AppData")
                .join("Local")
                .join("Programs")
                .join("Python")
                .join("Scripts"),
        ]);

        #[cfg(windows)]
        if let Some(local_python) = python_programs_dir(&home) {
            dirs.extend(versioned_python_script_dirs(&local_python));
        }
    }

    #[cfg(windows)]
    dirs.push(PathBuf::from(r"C:\ProgramData\chocolatey\bin"));

    #[cfg(unix)]
    dirs.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
        PathBuf::from("/snap/bin"),
    ]);

    dirs
}

#[cfg(windows)]
fn python_programs_dir(home: &Path) -> Option<PathBuf> {
    let dir = home
        .join("AppData")
        .join("Local")
        .join("Programs")
        .join("Python");
    dir.is_dir().then_some(dir)
}

#[cfg(windows)]
fn versioned_python_script_dirs(parent: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(parent) else {
        return Vec::new();
    };

    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("Scripts"))
        .filter(|path| path.is_dir())
        .collect()
}

fn ytdlp_file_name() -> &'static str {
    if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    }
}

fn ffmpeg_file_name() -> &'static str {
    if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    }
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

fn managed_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("bin").join(ytdlp_file_name()))
}

fn default_download_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .download_dir()
        .or_else(|_| app_data_dir(app))
        .map_err(|err| format!("Cannot resolve download dir: {err}"))?;
    Ok(base.join("DL Master"))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|err| format!("Cannot resolve app data dir: {err}"))
}

fn persisted_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("state.sqlite3"))
}

fn legacy_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("state.json"))
}

fn open_state_db(app: &AppHandle) -> Result<Connection, String> {
    let path = persisted_db_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Cannot create state dir: {err}"))?;
    }

    let conn = Connection::open(path).map_err(|err| format!("Cannot open SQLite state db: {err}"))?;
    conn.busy_timeout(Duration::from_secs(2))
        .map_err(|err| format!("Cannot configure SQLite: {err}"))?;
    initialize_state_db(&conn)?;
    Ok(conn)
}

fn initialize_state_db(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            http_proxy TEXT,
            default_resolution TEXT,
            download_dir TEXT
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY NOT NULL,
            backend_job_id TEXT,
            url TEXT NOT NULL,
            format TEXT NOT NULL,
            output_dir TEXT NOT NULL,
            status TEXT NOT NULL,
            progress REAL,
            total_bytes INTEGER,
            file_path TEXT,
            message TEXT NOT NULL,
            started_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS library (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            quality TEXT NOT NULL,
            size TEXT NOT NULL,
            size_bytes INTEGER,
            file_path TEXT,
            output_dir TEXT NOT NULL,
            completed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            kind TEXT NOT NULL,
            read INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        "#,
    )
    .map_err(|err| format!("Cannot initialize SQLite state db: {err}"))?;

    ensure_jobs_schema(conn)?;
    Ok(())
}

fn ensure_jobs_schema(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("PRAGMA table_info(jobs)")
        .map_err(|err| format!("Cannot inspect jobs schema: {err}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| format!("Cannot read jobs schema: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Cannot collect jobs schema: {err}"))?;

    for column in ["backend_job_id", "archive", "subtitles", "playlist", "proxy"] {
        if !columns.iter().any(|existing| existing == column) {
            let column_def = if column == "proxy" || column == "backend_job_id" {
                "TEXT"
            } else {
                "INTEGER NOT NULL DEFAULT 0"
            };
            conn.execute(
                &format!("ALTER TABLE jobs ADD COLUMN {column} {column_def}"),
                [],
            )
            .map_err(|err| format!("Cannot migrate jobs schema: {err}"))?;
        }
    }

    Ok(())
}

fn load_state_from_db(conn: &Connection) -> Result<PersistedState, String> {
    let theme_mode = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'theme_mode' LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| format!("Cannot read theme mode: {err}"))?;

    let settings = conn
        .query_row(
            "SELECT http_proxy, default_resolution, download_dir FROM settings WHERE id = 1",
            [],
            |row| {
                Ok(PersistedSettings {
                    http_proxy: row.get(0)?,
                    default_resolution: row.get(1)?,
                    download_dir: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(|err| format!("Cannot read settings: {err}"))?;

    let mut jobs_stmt = conn
        .prepare(
            "SELECT id, backend_job_id, url, format, output_dir, status, progress, total_bytes, file_path, message, started_at, archive, subtitles, playlist, proxy
             FROM jobs
             ORDER BY rowid DESC",
        )
        .map_err(|err| format!("Cannot prepare jobs query: {err}"))?;
    let jobs = jobs_stmt
        .query_map([], |row| {
            let total_bytes: Option<i64> = row.get(6)?;
            let archive: i64 = row.get(11)?;
            let subtitles: i64 = row.get(12)?;
            let playlist: i64 = row.get(13)?;
            Ok(PersistedJobItem {
                id: row.get(0)?,
                backend_job_id: row.get(1)?,
                url: row.get(2)?,
                format: row.get(3)?,
                output_dir: row.get(4)?,
                status: row.get(5)?,
                progress: row.get(6)?,
                total_bytes: total_bytes.and_then(|value| u64::try_from(value).ok()),
                file_path: row.get(7)?,
                message: row.get(8)?,
                started_at: row.get(9)?,
                archive: archive != 0,
                subtitles: subtitles != 0,
                playlist: playlist != 0,
                proxy: row.get(14)?,
            })
        })
        .map_err(|err| format!("Cannot read jobs: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Cannot collect jobs: {err}"))?;

    let mut library_stmt = conn
        .prepare(
            "SELECT id, title, quality, size, size_bytes, file_path, output_dir, completed_at
             FROM library
             ORDER BY rowid DESC",
        )
        .map_err(|err| format!("Cannot prepare library query: {err}"))?;
    let library = library_stmt
        .query_map([], |row| {
            let size_bytes: Option<i64> = row.get(4)?;
            let file_path: Option<String> = row.get(5)?;
            let output_dir: String = row.get(6)?;
            let resolved_file_path = file_path.or_else(|| {
                find_latest_media_file(Path::new(&output_dir))
                    .map(|path| path.display().to_string())
            });
            let resolved_size_bytes = size_bytes
                .and_then(|value| u64::try_from(value).ok())
                .or_else(|| {
                    resolved_file_path
                        .as_ref()
                        .and_then(|path| fs::metadata(path).ok())
                        .map(|metadata| metadata.len())
                });
            Ok(PersistedLibraryItem {
                id: row.get(0)?,
                title: row.get(1)?,
                quality: row.get(2)?,
                size: row.get(3)?,
                size_bytes: resolved_size_bytes,
                file_path: resolved_file_path,
                output_dir,
                completed_at: row.get(7)?,
            })
        })
        .map_err(|err| format!("Cannot read library: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Cannot collect library: {err}"))?;

    let mut notifications_stmt = conn
        .prepare(
            "SELECT id, title, body, kind, read, created_at
             FROM notifications
             ORDER BY rowid DESC",
        )
        .map_err(|err| format!("Cannot prepare notifications query: {err}"))?;
    let notifications = notifications_stmt
        .query_map([], |row| {
            let read_value: i64 = row.get(4)?;
            Ok(PersistedNotification {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                kind: row.get(3)?,
                read: read_value != 0,
                created_at: row.get(5)?,
            })
        })
        .map_err(|err| format!("Cannot read notifications: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Cannot collect notifications: {err}"))?;

    Ok(PersistedState {
        theme_mode,
        settings,
        jobs: (!jobs.is_empty()).then_some(jobs),
        library: (!library.is_empty()).then_some(library),
        notifications: (!notifications.is_empty()).then_some(notifications),
    })
}

fn save_state_to_db(conn: &mut Connection, state: &PersistedState) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|err| format!("Cannot start SQLite transaction: {err}"))?;

    tx.execute("DELETE FROM meta WHERE key = 'theme_mode'", [])
        .map_err(|err| format!("Cannot clear theme mode: {err}"))?;
    if let Some(theme_mode) = state.theme_mode.as_ref() {
        tx.execute(
            "INSERT INTO meta (key, value) VALUES ('theme_mode', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![theme_mode],
        )
        .map_err(|err| format!("Cannot save theme mode: {err}"))?;
    }

    tx.execute("DELETE FROM settings WHERE id = 1", [])
        .map_err(|err| format!("Cannot clear settings: {err}"))?;
    if let Some(settings) = state.settings.as_ref() {
        tx.execute(
            "INSERT INTO settings (id, http_proxy, default_resolution, download_dir) VALUES (1, ?, ?, ?)",
            params![settings.http_proxy, settings.default_resolution, settings.download_dir],
        )
        .map_err(|err| format!("Cannot save settings: {err}"))?;
    }

    tx.execute("DELETE FROM jobs", [])
        .map_err(|err| format!("Cannot clear jobs: {err}"))?;
    if let Some(items) = state.jobs.as_ref() {
        for item in items {
            tx.execute(
                "INSERT INTO jobs (id, backend_job_id, url, format, output_dir, status, progress, total_bytes, file_path, message, started_at, archive, subtitles, playlist, proxy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    &item.id,
                    &item.backend_job_id,
                    &item.url,
                    &item.format,
                    &item.output_dir,
                    &item.status,
                    item.progress,
                    item.total_bytes.and_then(|value| i64::try_from(value).ok()),
                    &item.file_path,
                    &item.message,
                    &item.started_at,
                    item.archive,
                    item.subtitles,
                    item.playlist,
                    &item.proxy
                ],
            )
            .map_err(|err| format!("Cannot save job: {err}"))?;
        }
    }

    tx.execute("DELETE FROM library", [])
        .map_err(|err| format!("Cannot clear library: {err}"))?;
    if let Some(items) = state.library.as_ref() {
        for item in items {
            tx.execute(
                "INSERT INTO library (id, title, quality, size, size_bytes, file_path, output_dir, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    &item.id,
                    &item.title,
                    &item.quality,
                    &item.size,
                    item.size_bytes.and_then(|value| i64::try_from(value).ok()),
                    &item.file_path,
                    &item.output_dir,
                    &item.completed_at
                ],
            )
            .map_err(|err| format!("Cannot save library item: {err}"))?;
        }
    }

    tx.execute("DELETE FROM notifications", [])
        .map_err(|err| format!("Cannot clear notifications: {err}"))?;
    if let Some(items) = state.notifications.as_ref() {
        for item in items {
            tx.execute(
                "INSERT INTO notifications (id, title, body, kind, read, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)",
                params![&item.id, &item.title, &item.body, &item.kind, item.read, &item.created_at],
            )
            .map_err(|err| format!("Cannot save notification: {err}"))?;
        }
    }

    tx.commit()
        .map_err(|err| format!("Cannot commit SQLite transaction: {err}"))
}

fn load_legacy_state(app: &AppHandle) -> Result<Option<PersistedState>, String> {
    let path = legacy_state_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&path)
        .map_err(|err| format!("Cannot read legacy persisted state: {err}"))?;
    let state = serde_json::from_str(&raw)
        .map_err(|err| format!("Cannot parse legacy persisted state: {err}"))?;
    Ok(Some(state))
}

trait PersistedStateExt {
    fn is_empty(&self) -> bool;
}

impl PersistedStateExt for PersistedState {
    fn is_empty(&self) -> bool {
        self.theme_mode.is_none()
            && self.settings.is_none()
            && self.jobs.as_ref().is_none_or(|items| items.is_empty())
            && self.library.as_ref().is_none_or(|items| items.is_empty())
            && self.notifications.as_ref().is_none_or(|items| items.is_empty())
    }
}

fn find_player_binary() -> Option<PathBuf> {
    let candidates = ["mpv", "vlc", "ffplay"];
    if let Some(player) = candidates
        .iter()
        .find_map(|candidate| which::which(candidate).ok())
    {
        return Some(player);
    }

    #[cfg(target_os = "macos")]
    {
        let quicktime =
            PathBuf::from("/Applications/QuickTime Player.app/Contents/MacOS/QuickTime Player");
        if quicktime.exists() {
            return Some(quicktime);
        }
    }

    None
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            app_status,
            load_persisted_state,
            install_ytdlp,
            start_download,
            cancel_download,
            open_path,
            play_path,
            delete_library_file,
            delete_library_item,
            save_persisted_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running DL Master");
}
