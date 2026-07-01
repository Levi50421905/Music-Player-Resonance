<div align="center">

# 🎵 Sonarix

**Pemutar musik desktop yang modern dan ringan, dibangun dengan Tauri + React**

[![Release](https://img.shields.io/github/v/release/Levi50421905/Music-Player-Sonarix?style=flat-square&color=6c63ff)](https://github.com/Levi50421905/Music-Player-Sonarix/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)](https://github.com/Levi50421905/Music-Player-Sonarix/releases)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange?style=flat-square)](https://tauri.app)

[![English](https://img.shields.io/badge/lang-English-lightgrey?style=for-the-badge)](README.md)
[![Bahasa Indonesia](https://img.shields.io/badge/lang-Bahasa%20Indonesia-6c63ff?style=for-the-badge)](README.id.md)

</div>

---

## ✨ Ringkasan

**Sonarix** adalah pemutar musik desktop yang cepat dan bersih, tetap menghormati pustaka musik lokalmu. Dibangun dengan Tauri 2 dan React, menggabungkan performa aplikasi native dengan fleksibilitas frontend web modern — semua dalam ukuran installer yang mungil.

---

## 🚀 Download

| Installer | Tipe | Rekomendasi |
|-----------|------|-------------|
| [Sonarix_1.2.3_x64-setup.exe](https://github.com/Levi50421905/Music-Player-Sonarix/releases/download/v1.2.3/Sonarix_1.2.3_x64-setup.exe) | Installer NSIS | ✅ Untuk kebanyakan pengguna |
| [Sonarix_1.2.3_x64_en-US.msi](https://github.com/Levi50421905/Music-Player-Sonarix/releases/download/v1.2.3/Sonarix_1.2.3_x64_en-US.msi) | Paket MSI | Untuk deployment enterprise / IT |

> **Khusus Windows** — dukungan macOS dan Linux direncanakan di rilis mendatang.

---

## 🎧 Fitur

- **Manajemen Pustaka Lokal** — scan folder dan kelola seluruh koleksi musikmu di satu tempat
- **Dukungan Multi-format** — memutar MP3, FLAC, WAV, OGG, AAC, M4A, ALAC, WMA, OPUS, APE
- **Decode FLAC Native** — decoding FLAC berkualitas tinggi dengan dukungan ReplayGain (tag R128 & RG)
- **Smart Audio Cache** — audio yang sudah di-decode disimpan cache untuk pemutaran ulang cepat, dengan eviction otomatis untuk menjaga penggunaan disk
- **Auto Folder Watch** — memantau folder musikmu di latar belakang dan otomatis mendeteksi file baru tanpa perlu scan manual
- **Lirik Tersinkron** — mengambil lirik format LRC secara otomatis via [lrclib.net](https://lrclib.net)
- **Preferensi Pustaka Tersimpan** — urutan, pengelompokan, filter, dan kolom yang terlihat disimpan dan dipulihkan antar sesi
- **Pustaka SQLite** — metadata pustakamu disimpan di database SQLite lokal — cepat, andal, tanpa cloud
- **Mini Player** — jendela mini player always-on-top saat kamu hanya butuh kontrol musik tanpa UI penuh
- **Integrasi File Manager** — buka folder lagu langsung di Windows Explorer

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Desktop Runtime | [Tauri 2](https://tauri.app) |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS 4 |
| State Management | Zustand |
| Backend / Audio | Rust (claxon, hound, tokio) |
| Database | SQLite via tauri-plugin-sql |
| Build Tool | Vite 5 |

---

## 📦 Instalasi

### Opsi 1 — Installer NSIS (Rekomendasi)
1. Download `Sonarix_1.2.3_x64-setup.exe`
2. Jalankan installer dan ikuti wizard setup
3. Buka **Sonarix** dari Start Menu atau shortcut Desktop

### Opsi 2 — Paket MSI
1. Download `Sonarix_1.2.3_x64_en-US.msi`
2. Jalankan file `.msi`
3. Ikuti prompt Windows Installer

> **Catatan:** Windows mungkin menampilkan peringatan SmartScreen saat pertama kali dibuka karena aplikasi belum code-signed. Klik **"More info" → "Run anyway"** untuk melanjutkan. Ini normal untuk rilis baru.

---

## 🖥️ Kebutuhan Sistem

| | Minimum |
|-|---------|
| OS | Windows 10 (x64) atau lebih baru |
| RAM | 100 MB |
| Disk | 30 MB (installer) + ruang cache untuk audio hasil decode |
| Runtime | WebView2 (sudah termasuk di Windows 10/11, otomatis terinstall jika belum ada) |

---

## 🔒 Privasi

Sonarix **sepenuhnya lokal**. Data pustaka musikmu tidak pernah meninggalkan perangkatmu. Satu-satunya koneksi jaringan eksternal yang dilakukan:

- **lrclib.net** — untuk mengambil lirik tersinkron (hanya saat kamu membuka panel lirik)
- **Google Fonts** — untuk tipografi UI

Tanpa telemetri. Tanpa akun. Tanpa langganan.

---

## 🐛 Known Issues

- Decoding MP3/AAC/M4A ditangani oleh codec native WebView2 sistem; kualitasnya tergantung ketersediaan codec di Windows
- Posisi jendela mini player belum tersimpan antar sesi
- File FLAC berukuran sangat besar (>1 jam) mungkin butuh beberapa detik untuk di-cache saat pertama diputar

---

## 📋 Changelog

### v1.2.3 — Rilis Terbaru

- **Auto-mix saat antrian habis** — jika repeat mati, putar lagu acak dari pustaka tanpa menambah ke antrian (setting bisa dimatikan di Settings → Perilaku)
- **`pickRandomNextSong()`** — menghindari lagu yang baru diputar (history 25 terakhir)
- **Lirik multi-baris di fullscreen** — scroll + highlight baris aktif, auto-scroll seperti panel sidebar
- **Volume slider di fullscreen** — mute + slider di overlay (player bar tertutup saat fullscreen)
- **Shuffle & repeat di fullscreen** — kontrol langsung di overlay
- **Klik judul buka fullscreen** — selain cover & tombol expand, klik judul di player bar juga membuka fullscreen
- **Filter duplikat di Pustaka** — tab Semua / Duplikat / Sembunyikan + badge oranye di kolom judul
- **Edit tag ke file asli** — checkbox di Tag Editor; menulis ID3/FLAC/Vorbis via Rust `lofty`
- **Bookmark pindah ke SQLite** — tabel `song_bookmarks`; migrasi otomatis dari localStorage lama
- **Splash screen branded** — icon `sonarix_icon_1024` + animasi glow/ring saat app dibuka
- **Favicon & title** — diperbarui ke Sonarix (bukan placeholder Vite)
- **Terjemahan baru** — filter duplikat, tag editor, auto-mix
- **Fix `tauri-plugin-autostart`** — dependency Rust dikembalikan (sempat terhapus saat tambah `lofty`)
- **Selaraskan versi Tauri** — `@tauri-apps/api` & CLI dipin ke 2.10.x

### v1.2.2

- **Tray + autostart + OS media keys** — Tauri tray icon, close-to-tray, start with Windows, global shortcuts (Play/Pause, Next, dll.)
- **Bookmark UI** — popover daftar/lompat/hapus bookmark di player bar
- **Mini lyrics independen** — lirik dimuat saat ganti lagu tanpa bergantung pada LyricsPanel yang ter-mount
- **Now playing fullscreen** — overlay baru, dibuka via `Shift+P` atau tombol ⛶ di player bar
- **Skip silence** — hook aktif saat setting `skipSilence` on
- **Duplikat mark di DB** — kolom `is_duplicate`, scanner menandai saat `duplicateHandling: mark`
- **Album art fetch** — cover diambil dari Cover Art Archive jika tag kosong saat scan
- **Scanner lebih canggih** — dukungan symlink, unblock otomatis Windows Zone.Identifier, prioritas tag multi-bahasa
- **Last.fm api_sig** — field API Secret + MD5 signing untuk scrobble/updateNowPlaying
- **EQ per mood re-apply** — refresh tiap jam / saat tab kembali visible
- **Auto-playlist malam** — lagu 4★+ FLAC/ALAC otomatis muncul di preview Smart (`autoPlaylistEnabled`)
- **Lyrics offline cache** — LyricsPanel menulis ke cache saat lirik dimuat
- **Edit metadata** — album, artist, folder, via klik kanan di Dashboard
- **Custom keybinds** — Settings → Shortcuts: fullscreen, command palette, queue

### v1.2.1

- **i18n konsisten (ID/EN)** — puluhan string UI dipusatkan ke `src/lib/i18n.ts` — navigasi, beranda, context menu, favorit, command palette, smart tab, toast
- **Mood/time slot** — `detectMoodContext` mengikuti bahasa aktif
- **Ganti bahasa** — di Settings → Bahasa, seluruh halaman yang sudah di-wire ikut berubah
- **Redesign grafik aktivitas 7 hari di Beranda** — bar chart SVG dengan sumbu Y + grid, angka di atas bar, garis tren, hari ini di-highlight, plus tooltip strip di bawah chart (putar + lagu unik); mode Mingguan / Per Jam pakai desain yang sama

### v1.2.0

- **Mode Radio** — saat antrian habis, putar mix baru (smart mood atau acak dari library)
- **Panel antrian bawah** — setting `queuePanelPosition: bottom` sekarang diterapkan
- **Tab Favorit** — tab baru untuk lagu ♥ loved; edit metadata dari sini
- **Media keys global** — Play/Pause/Next via Media Session API (`globalMediaKeys`)
- **Posisi mini player tersimpan** — disimpan ke localStorage, dipulihkan saat buka ulang
- **Edit metadata** — modal edit judul/artis/album/genre; klik kanan di Library
- **Deteksi duplikat** — scan duplikat di Settings; penanganan skip/mark saat import
- **Command palette** — `Ctrl+K` cari lagu + navigasi tab dari mana saja
- **Smart Radio** — radio berbasis mood/jam/hari (bukan random murni)
- **EQ preset per mood** — auto-apply saat buka tab Cerdas (`eqPresetPerMood`)
- **Dynamic theme** — accent color dari cover art lagu yang diputar
- **Mix builder** — pilih 2–3 mood → generate antrian campuran
- **Listening insights** — kartu statistik di Beranda (genre/jam, artis minggu ini)
- **A–B repeat** — tombol A/B di player bar untuk loop bagian lagu
- **Bookmark posisi** — tandai menit favorit (localStorage)
- **Lirik di mini player** — satu baris LRC sync di window mini
- **Last.fm scrobble (opsional)** — off by default (Settings → Last.fm)
- **Backup & restore DB satu klik** — untuk database SQLite pustaka
- **Export history** — JSON/CSV riwayat mendengarkan
- **Pengaturan diperluas** — Pemutaran (default shuffle/repeat, skip silence, playback speed default, scrobble threshold, preload depth, resume behavior, radio source), Pustaka (scan symlinks, auto-unblock, duplicate handling, exclude extensions, metadata language priority), Tampilan (waveform default style, player bar compact, dynamic theme, hidden tabs), Lirik (font size, offset manual, offline cache), Sistem (global media keys, close-to-tray, start with Windows, notifikasi cover), Data (backup otomatis, export log, clear cache selective)

### v1.1.1

- **Fix loop antrian manual** — lagu yang ditambahkan ke antrian sekarang ikut loop saat Repeat All aktif
- **Fix lag library** — antrian dibatasi 50 lagu di memori; play dari library maksimal 300 lagu (bukan seluruh library)
- **Fix scan M4A/ALAC** — file dibaca penuh hingga 64MB (fix file ~31MB); hapus head+tail concat yang invalid
- **Rust read_file_prefix** — cap dinaikkan dari 512KB ke 8MB
- **Waveform 3 gaya** — klik icon waveform: bars → mirror → line → progress bar
- **Streak mendengarkan** — badge hari berturut-turut di beranda
- **Lanjutkan antrian** — kartu resume antrian saat buka app
- **Lanjutkan sesi kemarin** — mix lagu jam serupa kemarin

### v1.1.0

- **Panel antrian samping** — buka antrian tanpa pindah tab; badge jumlah lagu di toolbar
- **Toast restore antrian** — notifikasi saat antrian dipulihkan setelah aplikasi dibuka kembali
- **Shortcut sleep timer** — `Ctrl+Shift+S` untuk memulai timer tidur 15 menit
- **Smart / Cerdas v2** — deteksi mood berdasarkan waktu & hari; rekomendasi mix; smart shuffle kontekstual
- **Badge kualitas audio** — di player bar: FLAC 24-bit/96kHz (emas), MP3/AAC/M4A dengan warna berbeda
- **Mode pilih** — checkbox di Album/Artis/Folder hanya muncul setelah tombol "Pilih"
- **Navigasi detail** — Escape atau klik tab yang sama untuk kembali dari detail album/artis/folder
- **Beranda** — header sapaan + mood hint; statistik dalam satu baris rapi
- **Mini player** — reuse window yang sudah ada; fokus ulang tanpa duplikat
- **Antrian persist** — antrian tidak hilang saat aplikasi ditutup; backup `upcomingQueue`
- **Sleep timer** — dropdown terlihat; banner aktif di player bar; persist ke localStorage
- **Pengaturan baru** — fade in, gapless, replay gain, queue end behavior, cover art style, play next
- **Deteksi M4A/MP4** — scan head+tail file untuk metadata (moov atom di akhir file)
- **Ekstensi audio** — mp4, m4b ditambahkan di scanner & Rust backend

### v1.0.3 — Rilis Perbaikan Bug & Polish

- **Preferensi pustaka kini tersimpan antar sesi** — urutan, format filter, pengelompokan, dan kolom yang terlihat disimpan ke `localStorage` dan dipulihkan saat aplikasi dibuka kembali
- **Fix progress bar "Add Files" tidak bergerak** — progress kini update per file dan menampilkan nama file & folder yang sedang diproses dengan benar
- **Hapus sisa debug `console.log`** — menghilangkan dampak performa pada volume slider (yang trigger ratusan kali per detik) dan saat lagu dimulai
- **Fix memory leak di audio engine** — event listener `visibilitychange` sekarang dihapus dengan benar saat audio engine di-destroy
- **Fix import path salah di `VirtualLibraryView.tsx`** — mencegah potensi build error akibat relative path yang salah ke `performance.ts`
- **Perbaikan kualitas kode kecil** — perbaiki indentasi di `setVolume()` dan update komentar yang menyesatkan soal perilaku `crossOrigin`

### v1.0.0 — Rilis Awal

- Pustaka musik lokal penuh dengan backend SQLite
- Pemutaran multi-format (MP3, FLAC, WAV, OGG, AAC, M4A, ALAC, WMA, OPUS, APE)
- Decode FLAC native dengan dukungan ReplayGain
- Smart audio cache dengan eviction otomatis
- Auto folder watch untuk update pustaka di latar belakang
- Lirik tersinkron via lrclib.net
- Mini player (always-on-top)
- Integrasi File Manager

---

## 🗺️ Roadmap

- [ ] Dukungan macOS
- [ ] Dukungan Linux
- [ ] Equalizer / efek DSP
- [ ] Import/export playlist (M3U, PLS)
- [ ] Scrobbling Last.fm
- [ ] Tema background berdasarkan album art
- [ ] Code signing untuk pengalaman install Windows yang lebih mulus

---

## 🧑‍💻 Build dari Source

### Prasyarat
- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

```bash
# Clone repository
git clone https://github.com/Levi50421905/Music-Player-Sonarix.git
cd Music-Player-Sonarix

# Install dependency frontend
npm install

# Jalankan mode development
npm run tauri

# Build binary release
npm run build:release
```

---

## 📄 Lisensi

Lisensi MIT — lihat [LICENSE](LICENSE) untuk detail.

---

<div align="center">
Dibuat dengan ♥ menggunakan Tauri, React, dan Rust
</div>