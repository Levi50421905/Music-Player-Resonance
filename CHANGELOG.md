# Changelog

## v1.2.3 — 2026-07-01

### Pemutaran & antrian
- **Auto-mix saat antrian habis** — Jika repeat mati, putar lagu acak dari pustaka tanpa menambah ke antrian (setting bisa dimatikan di Settings → Perilaku)
- **`pickRandomNextSong()`** — Menghindari lagu yang baru diputar (history 25 terakhir)

### Now playing fullscreen
- **Lirik multi-baris** — Scroll + highlight baris aktif, auto-scroll seperti panel sidebar
- **Volume slider** — Mute + slider di overlay (player bar tertutup saat fullscreen)
- **Shuffle & repeat** — Kontrol langsung di overlay
- **Klik judul di player bar** — Buka fullscreen selain cover & tombol expand

### Pustaka
- **Filter duplikat** — Tab Semua / Duplikat / Sembunyikan + badge oranye di kolom judul
- **Edit tag ke file asli** — Checkbox di Tag Editor; tulis ID3/FLAC/Vorbis via Rust `lofty`

### Data & bookmark
- **Bookmark ke SQLite** — Tabel `song_bookmarks`; migrasi otomatis dari localStorage lama

### UX startup
- **Splash screen branded** — Icon `sonarix_icon_1024` + animasi glow/ring saat app dibuka
- **Favicon & title** — Diperbarui ke Sonarix (bukan placeholder Vite)

### i18n
- Key baru: filter duplikat, tag editor, auto-mix

### Build & infra
- **Fix `tauri-plugin-autostart`** — Dependency Rust dikembalikan (sempat terhapus saat tambah `lofty`)
- **Selaraskan versi Tauri** — `@tauri-apps/api` & CLI dipin ke 2.10.x

---

## v1.2.2 — 2026-06-30

### Fitur partial → selesai
- **Tray + autostart + OS media keys** — Tauri tray icon, close-to-tray, start with Windows, global shortcuts (`MediaPlayPause` dll.)
- **Bookmark UI** — Popover daftar/lompat/hapus bookmark di player bar
- **Mini lyrics independen** — `ensureLyricsLoaded()` saat ganti lagu (tidak bergantung LyricsPanel mount)
- **Now playing fullscreen** — Overlay `Shift+P` + tombol ⛶ di player bar
- **Skip silence** — Hook aktif saat setting `skipSilence` on
- **Duplikat mark di DB** — Kolom `is_duplicate`, scanner menandai saat `duplicateHandling: mark`
- **Album art fetch** — Cover dari Cover Art Archive jika tag kosong saat scan
- **Scanner lanjutan** — Symlinks, unblock Windows Zone.Identifier, prioritas tag multi-bahasa
- **Last.fm api_sig** — Field API Secret + MD5 signing untuk scrobble/updateNowPlaying
- **EQ per mood re-apply** — Refresh tiap jam / saat tab visible
- **Auto-playlist malam** — 4★+ FLAC/ALAC otomatis di preview Smart (setting `autoPlaylistEnabled`)
- **Lyrics offline cache** — LyricsPanel menulis ke cache saat lirik dimuat
- **Edit metadata** — Album, Artist, Folder, Dashboard (klik kanan)
- **Custom keybinds** — Settings → Shortcuts: fullscreen, command palette, queue

---

## v1.2.1 — 2026-06-30

### i18n (Bahasa ID / EN konsisten)
- Puluhan string UI dipusatkan ke `src/lib/i18n.ts` — navigasi, beranda, context menu, favorit, command palette, smart tab, toast
- Mood/time slot (`detectMoodContext`) mengikuti bahasa aktif
- Ganti bahasa di **Settings → Bahasa** → seluruh halaman yang sudah di-wire ikut berubah

### Beranda — grafik aktivitas 7 hari (redesign)
- Bar chart SVG dengan **sumbu Y + grid**, **angka di atas bar**, **garis tren**, hari ini di-highlight
- Tooltip strip di bawah chart (putar + lagu unik)
- Mode Mingguan / Per Jam pakai desain yang sama

---

## v1.2.0 — 2026-06-30

### Gap fixes (UI sudah ada, fitur belum jalan)
- **Mode Radio** — Saat antrian habis, putar mix baru (smart mood atau acak dari library)
- **Panel antrian bawah** — Setting `queuePanelPosition: bottom` sekarang diterapkan
- **Tab Favorit** — Tab baru untuk lagu ♥ loved; edit metadata dari sini
- **Media keys global** — Play/pause/next via Media Session API (setting `globalMediaKeys`)
- **Posisi mini player** — Disimpan ke localStorage, dipulihkan saat buka ulang
- **Edit metadata** — Modal edit judul/artis/album/genre; klik kanan di Library
- **Deteksi duplikat** — Scan duplikat di Settings; penanganan skip/mark saat import
- **Command palette** — `Ctrl+K` cari lagu + navigasi tab dari mana saja

### Fitur mood & smart (on-brand)
- **Smart Radio** — Radio berbasis mood/jam/hari (bukan random murni)
- **EQ preset per mood** — Auto-apply saat buka tab Cerdas (setting `eqPresetPerMood`)
- **Dynamic theme** — Accent dari cover art lagu yang diputar
- **Mix builder** — Pilih 2–3 mood → generate antrian campuran
- **Listening insights** — Kartu statistik di Beranda (genre/jam, artis minggu ini)

### Fitur pemutaran & UX
- **A–B repeat** — Tombol A/B di player bar untuk loop bagian lagu
- **Bookmark posisi** — Tandai menit favorit (localStorage)
- **Lirik di mini player** — Satu baris LRC sync di window mini
- **Last.fm scrobble** — Opsional, off by default (Settings → Last.fm)
- **Backup & restore DB** — Satu klik backup/restore SQLite
- **Export history** — JSON/CSV riwayat mendengarkan

### Pengaturan baru (Extended Settings)
- Pemutaran: default shuffle/repeat, skip silence (flag), playback speed default, scrobble threshold, preload depth, resume behavior, radio source
- Pustaka: scan symlinks (flag), auto-unblock (flag), duplicate handling, exclude extensions, metadata language priority
- Tampilan: waveform default style, player bar compact, dynamic theme, hidden tabs
- Lirik: font size, offset manual, offline cache (flag)
- Sistem: global media keys, close-to-tray (flag), start with Windows (flag), notifikasi cover
- Data: backup otomatis (flag), export log, clear cache selective

### Catatan
- Beberapa setting advanced (tray, autostart, skip silence audio, now-playing fullscreen, custom keybinds) tersimpan di UI; implementasi native/logic menyusul di patch berikutnya.
- Album art fetch (MusicBrainz) tersedia sebagai modul `albumArtFetch.ts` untuk integrasi berikutnya.

---

## v1.1.1 — 2026-06-30

### Perbaikan
- **Loop antrian manual** — Lagu yang ditambahkan ke antrian sekarang ikut loop saat Repeat All aktif
- **Lag library** — Antrian dibatasi 50 lagu di memori; play dari library max 300 lagu (bukan seluruh library)
- **M4A/ALAC** — Scan baca file penuh hingga 64MB (fix file ~31MB); hapus head+tail concat yang invalid
- **Rust read_file_prefix** — Cap dinaikkan dari 512KB ke 8MB

### Fitur
- **Waveform 3 gaya** — Klik icon waveform: bars → mirror → line → progress bar
- **Streak mendengarkan** — Badge hari berturut-turut di beranda (#2)
- **Lanjutkan antrian** — Kartu resume antrian saat buka app (#3)
- **Lanjutkan sesi kemarin** — Mix lagu jam serupa kemarin (#10)

---

## v1.1.0 — 2026-06-30

### Fitur Baru
- **Panel antrian samping** — Buka antrian tanpa pindah tab; badge jumlah lagu di toolbar
- **Toast restore antrian** — Notifikasi saat antrian dipulihkan setelah aplikasi dibuka kembali
- **Shortcut sleep timer** — `Ctrl+Shift+S` untuk memulai timer tidur 15 menit
- **Smart / Cerdas v2** — Deteksi mood berdasarkan waktu & hari; rekomendasi mix; smart shuffle kontekstual
- **Badge kualitas audio** — Di player bar: FLAC 24-bit/96kHz (emas), MP3/AAC/M4A dengan warna berbeda
- **Mode pilih** — Checkbox di Album/Artis/Folder hanya muncul setelah tombol "Pilih"
- **Navigasi detail** — Escape atau klik tab yang sama untuk kembali dari detail album/artis/folder
- **Beranda** — Header sapaan + mood hint; statistik dalam satu baris rapi
- **Mini player** — Reuse window yang sudah ada; fokus ulang tanpa duplikat

### Perbaikan
- **Antrian persist** — Antrian tidak hilang saat aplikasi ditutup; backup `upcomingQueue`
- **Sleep timer** — Dropdown terlihat; banner aktif di player bar; persist ke localStorage
- **Pengaturan** — Fade in, gapless, replay gain, queue end behavior, cover art style, play next
- **Deteksi M4A/MP4** — Scan head+tail file untuk metadata (moov atom di akhir file)
- **Ekstensi audio** — mp4, m4b ditambahkan di scanner & Rust backend

## v1.0.3
Versi sebelumnya — smart shuffle dasar, replay gain, gapless, EQ, LRC sync, folder watch.
