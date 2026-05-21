# DL Master Build and Release

DL Master is a Tauri v2 desktop application that wraps `yt-dlp` with a local UI and a Rust process manager.

## Development

```bash
cd /Users/fatelei/github/dl-master-tauri
npm install
npm run tauri dev
```

## Build Installers

```bash
npm run tauri build
```

Tauri builds the native installer for the current operating system:

- macOS: `.dmg` and `.app`
- Windows: `.msi` / `.exe` depending on configured bundle targets
- Linux: `.deb`, `.rpm`, or AppImage depending on installed system tooling

Cross-compiling desktop installers is not recommended for this project because WebView and platform packagers are OS-specific. Build each target on its own OS or in CI runners for macOS, Windows, and Linux.

## GitHub Actions

The workflow at `.github/workflows/build.yml` builds installers on:

- `macos-latest`
- `windows-latest`
- `ubuntu-22.04`

It uploads the generated Tauri bundle directory as GitHub Actions artifacts for each platform.

Run it manually from the GitHub Actions tab with `workflow_dispatch`, or push a tag like `v0.1.0`.

When the workflow is triggered by a `v*` tag, it also creates a GitHub Release and uploads available installers:

- macOS `.dmg`
- Windows `.msi` / `.exe`
- Linux `.deb`, `.rpm`, `.AppImage`

## Icons

The source icon is `app-icon.png`. Regenerate it with:

```bash
python3 scripts/generate_app_icon.py
npm run tauri icon app-icon.png
```

Tauri writes the platform-specific assets into `src-tauri/icons`.

## Runtime Tooling

The app first searches for `yt-dlp` in its managed app data directory, then falls back to the system `PATH`. The UI can install or update the managed binary from the official `yt-dlp` GitHub release URL.

`ffmpeg` is detected from `PATH`. Some sites and format merges work better when ffmpeg is installed.
