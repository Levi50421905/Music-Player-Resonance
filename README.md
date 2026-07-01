<div align="center">

# 🎵 Sonarix

**A modern, lightweight desktop music player built with Tauri + React**

[![Release](https://img.shields.io/github/v/release/Levi50421905/Music-Player-Sonarix?style=flat-square&color=6c63ff)](https://github.com/Levi50421905/Music-Player-Sonarix/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)](https://github.com/Levi50421905/Music-Player-Sonarix/releases)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange?style=flat-square)](https://tauri.app)

[![English](https://img.shields.io/badge/lang-English-6c63ff?style=for-the-badge)](README.md)
[![Bahasa Indonesia](https://img.shields.io/badge/lang-Bahasa%20Indonesia-lightgrey?style=for-the-badge)](README.id.md)

</div>

---

## ✨ Overview

**Sonarix** is a fast, clean desktop music player that respects your local music library. Built with Tauri 2 and React, it combines the performance of a native app with the flexibility of a modern web frontend — all in a tiny installer footprint.

---

## 🚀 Download

| Installer | Type | Recommended |
|-----------|------|-------------|
| [Sonarix_1.2.3_x64-setup.exe](https://github.com/Levi50421905/Music-Player-Sonarix/releases/download/v1.2.3/Sonarix_1.2.3_x64-setup.exe) | NSIS Installer | ✅ Most users |
| [Sonarix_1.2.3_x64_en-US.msi](https://github.com/Levi50421905/Music-Player-Sonarix/releases/download/v1.2.3/Sonarix_1.2.3_x64_en-US.msi) | MSI Package | For enterprise / IT deployment |

> **Windows only** — macOS and Linux builds are planned for a future release.

---

## 🎧 Features

- **Local Library Management** — scan folders and manage your entire music collection in one place
- **Multi-format Support** — plays MP3, FLAC, WAV, OGG, AAC, M4A, ALAC, WMA, OPUS, APE
- **FLAC Native Decode** — high-quality FLAC decoding with ReplayGain support (R128 & RG tags)
- **Smart Audio Cache** — decoded audio is cached for fast repeat playback, with automatic eviction to manage disk usage
- **Auto Folder Watch** — monitors your music folders in the background and automatically picks up new files without needing a manual rescan
- **Synchronized Lyrics** — fetches LRC-format synced lyrics automatically via [lrclib.net](https://lrclib.net)
- **Persistent Library Preferences** — sort order, grouping, filters, and visible columns are saved and restored between sessions
- **SQLite Library** — your library metadata is stored in a local SQLite database — fast, reliable, no cloud required
- **Mini Player** — a compact always-on-top mini player window for when you want music controls without the full UI
- **File Manager Integration** — open any track's folder directly in Windows Explorer

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Runtime | [Tauri 2](https://tauri.app) |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS 4 |
| State Management | Zustand |
| Backend / Audio | Rust (claxon, hound, tokio) |
| Database | SQLite via tauri-plugin-sql |
| Build Tool | Vite 5 |

---

## 📦 Installation

### Option 1 — NSIS Installer (Recommended)
1. Download `Sonarix_1.2.3_x64-setup.exe`
2. Run the installer and follow the setup wizard
3. Launch **Sonarix** from the Start Menu or Desktop shortcut

### Option 2 — MSI Package
1. Download `Sonarix_1.2.3_x64_en-US.msi`
2. Run the `.msi` file
3. Follow the Windows Installer prompts

> **Note:** Windows may show a SmartScreen warning on first launch since the app is not yet code-signed. Click **"More info" → "Run anyway"** to proceed. This is expected for new releases.

---

## 🖥️ System Requirements

| | Minimum |
|-|---------|
| OS | Windows 10 (x64) or later |
| RAM | 100 MB |
| Disk | 30 MB (installer) + cache space for decoded audio |
| Runtime | WebView2 (bundled with Windows 10/11, auto-installed if missing) |

---

## 🔒 Privacy

Sonarix is **fully local**. Your music library data never leaves your machine. The only external network calls made are:

- **lrclib.net** — to fetch synchronized lyrics (only when you open the lyrics panel)
- **Google Fonts** — for UI typography

No telemetry. No accounts. No subscriptions.

---

## 🐛 Known Issues

- MP3/AAC/M4A decoding is handled by the system's native WebView2 codec; quality depends on Windows codec availability
- Mini player window position is not persisted between sessions
- Very large FLAC files (>1 hour) may take a few seconds to cache on first play

---

## 📋 Changelog

### v1.2.3 — Latest Release

- **Auto-mix on empty queue** — when repeat is off, a random track from your library plays without being added to the queue (toggle in Settings → Behavior)
- **Smarter random picks** — `pickRandomNextSong()` avoids repeating any of the last 25 tracks played
- **Multi-line lyrics in fullscreen** — scroll with active-line highlight and auto-scroll, matching the sidebar panel
- **Fullscreen volume control** — mute + slider available in the fullscreen overlay
- **Fullscreen shuffle & repeat** — controls now available directly in the overlay
- **Open fullscreen from title** — clicking the track title in the player bar now opens fullscreen, not just the cover/expand button
- **Duplicate filter in Library** — new All / Duplicates / Hidden tabs with an orange badge on the title column
- **Tag editing writes to file** — optional checkbox in the Tag Editor to write ID3/FLAC/Vorbis tags directly via Rust `lofty`
- **Bookmarks moved to SQLite** — new `song_bookmarks` table with automatic migration from the old localStorage data
- **Branded splash screen** — animated glow/ring intro using the `sonarix_icon_1024` icon
- **Favicon & window title** — updated to Sonarix branding (previously the Vite placeholder)
- **New translations** — duplicate filter, tag editor, and auto-mix strings added to i18n
- **Fixed `tauri-plugin-autostart`** — restored a Rust dependency that was accidentally dropped when `lofty` was added
- **Aligned Tauri versions** — `@tauri-apps/api` and the Tauri CLI pinned to 2.10.x

### v1.2.2

- **Tray, autostart & OS media keys** — Tauri tray icon, close-to-tray, start with Windows, and global shortcuts (Play/Pause, Next, etc.)
- **Bookmark UI** — popover to list, jump to, and delete bookmarks from the player bar
- **Independent mini lyrics** — lyrics now load on track change without depending on the main Lyrics panel being mounted
- **Now Playing fullscreen** — new overlay, opened via `Shift+P` or the ⛶ button in the player bar
- **Skip silence** — the skip-silence hook is now active when the setting is enabled
- **Duplicate marking in DB** — new `is_duplicate` column, set automatically by the scanner when duplicate handling is set to "mark"
- **Album art fetch** — missing cover art is pulled from the Cover Art Archive during scans
- **Improved scanner** — symlink support, automatic Windows Zone.Identifier unblocking, multi-language tag priority
- **Last.fm scrobbling** — added API secret field with MD5 signing for scrobble/now-playing updates
- **Mood-based EQ re-apply** — presets refresh hourly or when the tab becomes visible again
- **Nightly auto-playlist** — 4★+ FLAC/ALAC tracks are automatically added to the Smart tab preview (`autoPlaylistEnabled`)
- **Offline lyrics cache** — the Lyrics panel now writes to cache as lyrics are loaded
- **Metadata editing** — edit album, artist, and folder details via right-click from the Dashboard
- **Custom keybinds** — configurable shortcuts for fullscreen, command palette, and queue in Settings → Shortcuts

### v1.2.1

- **Consistent i18n (EN/ID)** — dozens of UI strings centralized in `src/lib/i18n.ts`, covering navigation, home, context menus, favorites, command palette, Smart tab, and toasts
- **Mood/time-of-day context** — `detectMoodContext` now follows the active language
- **Language switching** — changing language in Settings → Language now updates every wired page
- **Redesigned 7-day activity chart on Home** — SVG bar chart with Y-axis and grid lines, value labels above each bar, a trend line, and today's bar highlighted, plus a tooltip strip below the chart (plays + unique tracks); Weekly and Hourly views share the same design

### v1.2.0

- **Radio mode** — when the queue runs out, a new mix plays automatically (smart mood-based or random from the library)
- **Bottom queue panel** — the `queuePanelPosition: bottom` setting is now actually applied
- **Favorites tab** — dedicated tab for ♥ loved tracks, with metadata editing available from here
- **Global media keys** — Play/Pause/Next via the Media Session API (`globalMediaKeys` setting)
- **Mini player position memory** — window position is saved to localStorage and restored on reopen
- **Metadata editing modal** — edit title/artist/album/genre via right-click in the Library
- **Duplicate detection** — scan for duplicates in Settings, with skip/mark handling on import
- **Command palette** — `Ctrl+K` to search tracks and jump between tabs from anywhere
- **Smart Radio** — mood/time/day-aware radio instead of pure random
- **Mood-based EQ presets** — auto-applied when opening the Smart tab (`eqPresetPerMood`)
- **Dynamic theme** — accent color derived from the currently playing track's cover art
- **Mix builder** — combine 2–3 moods to generate a blended queue
- **Listening insights** — new stat cards on Home (genres by hour, top artists this week)
- **A–B repeat** — loop a section of a track from the player bar
- **Position bookmarks** — save your favorite timestamp in a track (localStorage)
- **Mini player lyrics** — single-line LRC sync shown in the mini player window
- **Last.fm scrobbling (optional)** — off by default, configurable in Settings → Last.fm
- **One-click DB backup & restore** — for the SQLite library database
- **Listening history export** — JSON/CSV export
- **Extended settings** — new options across Playback (default shuffle/repeat, skip silence, default speed, scrobble threshold, preload depth, resume behavior, radio source), Library (symlink scanning, auto-unblock, duplicate handling, excluded extensions, tag language priority), Appearance (default waveform style, compact player bar, dynamic theme, hidden tabs), Lyrics (font size, manual offset, offline cache), System (global media keys, close-to-tray, start with Windows, cover notifications), and Data (auto backup, log export, selective cache clearing)

### v1.1.1

- **Fixed manual queue looping** — manually queued tracks now correctly loop when Repeat All is on
- **Reduced library lag** — the in-memory queue is now capped at 50 tracks, and playing from the library loads at most 300 tracks instead of the whole library
- **Fixed M4A/ALAC scanning** — files are now read in full up to 64MB (fixing ~31MB files); removed an invalid head+tail concatenation approach
- **Increased Rust read cap** — `read_file_prefix` raised from 512KB to 8MB
- **3-style waveform** — click the waveform icon to cycle bars → mirror → line → progress bar
- **Listening streak badge** — shows consecutive listening days on Home
- **Resume queue card** — shown on Home when reopening the app
- **Yesterday's session mix** — suggests a mix based on tracks played around the same time yesterday

### v1.1.0

- **Side queue panel** — view the queue without switching tabs, with a track-count badge in the toolbar
- **Queue restore toast** — notification when the queue is restored after reopening the app
- **Sleep timer shortcut** — `Ctrl+Shift+S` starts a 15-minute sleep timer
- **Smart tab v2** — mood detection based on time and day, mix recommendations, and contextual smart shuffle
- **Audio quality badge** — shown in the player bar (gold for FLAC 24-bit/96kHz, distinct colors for MP3/AAC/M4A)
- **Selection mode** — checkboxes in Album/Artist/Folder views now only appear after pressing "Select"
- **Detail view navigation** — Escape or clicking the active tab again returns from an album/artist/folder detail view
- **Redesigned Home** — greeting header with mood hint, stats condensed into a single row
- **Mini player reuse** — refocuses the existing mini player window instead of spawning duplicates
- **Persistent queue** — the queue survives app restarts via an `upcomingQueue` backup
- **Sleep timer fixes** — dropdown visibility, active banner in the player bar, and persistence to localStorage
- **New playback settings** — fade in, gapless playback, ReplayGain, queue-end behavior, cover art style, and play-next
- **Improved M4A/MP4 detection** — scans both head and tail of the file for metadata (moov atom at file end)
- **New extensions supported** — `.mp4` and `.m4b` added to both the scanner and the Rust backend

### v1.0.3 — Bug Fix & Polish Release

- **Library preferences now persist between sessions** — sort order, filter format, grouping, and visible columns are saved to `localStorage` and restored on next launch
- **Fixed "Add Files" progress bar not moving** — progress now updates per file and correctly shows the current filename and folder being processed
- **Removed leftover debug `console.log` calls** — eliminates performance impact on volume slider (which fires hundreds of times per second) and on track start
- **Fixed memory leak in audio engine** — the `visibilitychange` event listener is now properly removed when the audio engine is destroyed
- **Fixed incorrect import path in `VirtualLibraryView.tsx`** — prevented a potential build error caused by a wrong relative path to `performance.ts`
- **Minor code quality fixes** — corrected indentation in `setVolume()` and updated a misleading comment about `crossOrigin` behavior

### v1.0.0 — Initial Release

- Full local music library with SQLite backend
- Multi-format playback (MP3, FLAC, WAV, OGG, AAC, M4A, ALAC, WMA, OPUS, APE)
- FLAC native decode with ReplayGain support
- Smart audio cache with automatic eviction
- Auto folder watch for background library updates
- Synchronized lyrics via lrclib.net
- Mini player (always-on-top)
- File Manager integration

---

## 🗺️ Roadmap

- [ ] macOS support
- [ ] Linux support
- [ ] Equalizer / DSP effects
- [ ] Playlist import/export (M3U, PLS)
- [ ] Last.fm scrobbling
- [ ] Album art background themes
- [ ] Code signing for smoother Windows install experience

---

## 🧑‍💻 Building from Source

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

```bash
# Clone the repository
git clone https://github.com/Levi50421905/Music-Player-Sonarix.git
cd Music-Player-Sonarix

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri

# Build release binary
npm run build:release
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
Made with ♥ using Tauri, React, and Rust
</div>