# DL Master

DL Master is a cross-platform desktop download manager powered by [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) and built with [Tauri](https://tauri.app/).

It provides a local UI for:

- downloading videos and audio
- managing a persistent queue
- retrying failed jobs
- browsing completed downloads in a library
- opening the output folder or playing the downloaded file
- saving settings locally with SQLite-backed persistence

## Features

- Download videos, playlists, or audio
- Choose common output formats and resolutions
- Use an HTTP proxy for downloads
- Keep subtitles and archive downloaded IDs
- Retry failed queue items without creating a new visible task
- Persist queue, library, notifications, and settings across restarts
- Open the output folder or play the media file with the system player
- Automatic theme switching with Light, Dark, and Auto modes
- Cross-platform support for macOS, Windows, and Linux

## Requirements

- Node.js 18+
- Rust toolchain
- `yt-dlp`
- `ffmpeg` is recommended for merging video and audio

You can either:

- install `yt-dlp` on your system and let DL Master find it from `PATH`
- or use the built-in `Install / Update yt-dlp` action in the app

## Development

```bash
cd ~/github/dl-master-tauri
npm install
npm run tauri dev
```

## Build

Build the desktop app for the current platform:

```bash
npm run tauri build
```

Build only the frontend:

```bash
npm run build
```

## Packaging

Tauri bundles platform-specific installers for the host OS:

- macOS: `.dmg` and `.app`
- Windows: `.msi` or `.exe`
- Linux: `.deb`, `.rpm`, or AppImage depending on local tooling

macOS builds currently use ad-hoc signing so GitHub Actions artifacts can be opened on Apple Silicon machines without showing a damaged-app error. If you add an Apple Developer certificate later, you can switch to full signing and notarization.

## GitHub Actions

The repository includes a workflow in `.github/workflows/build.yml` that builds installers on:

- `macos-latest`
- `windows-latest`
- `ubuntu-22.04`

When the workflow runs on a `v*` tag, it also creates a GitHub Release and uploads the available installer artifacts.

## App Data

DL Master stores persistent state in the application data directory using SQLite.

Stored data includes:

- queue jobs
- library items
- notifications
- theme and settings

## Runtime Notes

- The app resolves `yt-dlp` from its managed application directory first, then falls back to the system `PATH`.
- `ffmpeg` is used when available to merge audio and video streams cleanly.
- Downloaded files are written to the configured output directory.

## Icon

The app icon source is `app-icon.png`.
Regenerate platform icons with:

```bash
python3 scripts/generate_app_icon.py
npm run tauri icon app-icon.png
```

## License

No license has been added yet.
