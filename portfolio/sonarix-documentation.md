# Sonarix — Project Documentation

> Desktop music player lokal. Tanpa streaming, tanpa akun wajib. Library milik kamu, di mesin kamu.

**Versi:** 1.2.3  
**Platform:** Windows (Tauri 2)  
**Status:** Active development — usable daily driver untuk koleksi pribadi

---

## Apa itu Sonarix?

Sonarix adalah aplikasi desktop untuk mendengarkan musik dari folder lokal. Fokusnya bukan jadi “Spotify killer”, tapi player yang enak dipakai sehari-hari kalau kamu punya ratusan atau ribuan file MP3/FLAC sendiri.

Kenapa dibuat? Saya sering frustrasi dengan player bawaan OS atau app web yang:
- Butuh internet untuk hal sepele
- UI-nya generic
- Fitur library management kurang fleksibel
- Tidak nyaman untuk koleksi lossless / tag berantakan

Sonarix jawabannya sederhana: **scan folder → index ke SQLite → putar dengan kontrol penuh.**

---

## Fitur utama

### Library & scan
- Scan folder musik (drag-drop atau dialog)
- Index metadata ke SQLite (judul, artis, album, genre, bitrate, format, BPM, dll.)
- Virtual scroll untuk library besar
- Filter format (MP3, FLAC, …)
- **Filter duplikat** — badge + tab Semua / Duplikat / Sembunyikan
- Edit metadata dari UI; opsional **tulis ke file asli** (ID3/FLAC)
- Deteksi duplikat saat scan (skip / mark / allow)
- Favorit (♥), rating bintang, play count
- Folder view, album view, artist view

### Pemutaran
- Gapless playback, crossfade, replay gain
- Shuffle modes + repeat (off / all / one)
- Antrian manual + unified queue panel
- **Auto-mix** — lanjut random dari library saat antrian habis (repeat off)
- Mode Radio smart (mood/jam) saat antrian habis
- A–B loop, sleep timer, playback speed
- Bookmark posisi (disimpan di DB)
- Waveform seekbar (bars / mirror / line)

### Smart & mood
- Rekomendasi berdasarkan jam/hari
- Mix builder (2–3 mood)
- EQ preset per mood (opsional)
- Dynamic theme dari cover art

### Lirik
- Local `.lrc` + fetch online (LRCLib / Lyrics.ovh)
- Panel sidebar multi-baris
- **Fullscreen now playing** — lirik scroll, volume, shuffle, repeat
- Offline lyrics cache

### Integrasi sistem
- Tray icon, close-to-tray, start with Windows
- Global media keys
- Mini player window
- Notifikasi track change
- Last.fm scrobble (opsional, manual API setup)

### Data
- Backup & restore SQLite
- Export play history JSON/CSV
- Bookmark & settings persist

---

## Tech stack

| Layer | Teknologi |
|-------|-----------|
| UI | React 18, TypeScript, Vite |
| State | Zustand (persist ke localStorage) |
| Desktop | Tauri 2 (Rust backend) |
| Database | SQLite via `@tauri-apps/plugin-sql` |
| Audio | HTML5 Audio + custom `audioEngine` (dual slot gapless) |
| Metadata file | `music-metadata` (scan), `lofty` (write tags di Rust) |
| Styling | CSS custom properties (dark theme, accent purple/pink) |

Kenapa Tauri? Lebih ringan dari Electron, akses file system native, dan cocok untuk app “tool” pribadi yang tidak perlu browser penuh.

Kenapa SQLite? Library musik = relational data sederhana. Query cepat, backup satu file, migrasi schema mudah.

---

## Struktur project (ringkas)

```
resonance/
├── src/                    # Frontend React
│   ├── App.tsx             # Shell utama, routing tab, playback orchestration
│   ├── components/         # UI per fitur (Library, Player, Settings, …)
│   ├── hooks/              # Media keys, skip silence, dynamic theme, …
│   ├── lib/                # db, scanner, audioEngine, i18n, radioEngine, …
│   └── store/              # Zustand player + settings + library
├── src-tauri/              # Rust backend
│   ├── src/lib.rs          # Commands: decode, watch folder, write metadata, …
│   └── icons/              # sonarix_icon_1024.png dll.
├── public/                 # Static assets (icon splash)
└── portfolio/              # Konten dokumentasi & blog untuk website pribadi
```

---

## Cara kerja (high level)

1. **Scan** — Frontend panggil Rust / FS plugin, baca file audio, parse tag, upsert ke `songs` table.
2. **Play** — `audioEngine` load path file, dual `<audio>` element untuk gapless preload.
3. **Queue** — `usePlayerStore` simpan `playContext`, `manualQueue`, `_shufflePool`; `nextTrack()` urus advance.
4. **Antrian habis** — `handleNext()` cek repeat → queue end behavior → auto-mix random.
5. **Persist** — Player state partial persist; library di SQLite; bookmark di `song_bookmarks`.

---

## Setup & development

**Requirements:** Node 18+, Rust stable, Tauri prerequisites (Windows: WebView2, MSVC)

```bash
npm install
npm run tauri dev      # dev mode
npm run build          # frontend only
npm run tauri build    # production installer
```

Port dev Vite: `1420`

---

## Design decisions (catatan singkat)

- **Dark-first UI** — Lebih nyaman untuk listening session malam; accent ungu/pink dari brand icon.
- **i18n ID/EN** — Bukan afterthought; string dipusatkan di `i18n.ts`.
- **Fullscreen terpisah dari player bar** — Overlay fokus; kontrol transport + lirik + volume self-contained.
- **Auto-mix tanpa enqueue** — Random track langsung `playSong()`, antrian tidak “kotor” dengan puluhan lagu generated.
- **Tag write opt-in** — Default tetap library-only; checkbox eksplisit sebelum sentuh file asli.

---

## Known issues / next up

- Last.fm masih manual (API key + secret + session) — OAuth wizard belum ada
- Duplicate manager view (merge/hapus batch) belum ada — hanya filter + scan
- Visualizer di fullscreen, queue drawer fullscreen — planned
- Beberapa setting advanced masih flag-only di UI lama

---

## Changelog ringkas

Lihat [`CHANGELOG.md`](../CHANGELOG.md) untuk detail per versi.

**v1.2.3** — Auto-mix, fullscreen lirik/volume, filter duplikat, bookmark DB, tag write, splash screen  
**v1.2.2** — Tray, media keys, bookmark UI, skip silence, duplikat mark  
**v1.2.1** — i18n konsisten, chart aktivitas redesign  
**v1.2.0** — Radio mode, command palette, smart mood, backup DB  

---

## License & credits

Project pribadi / portfolio. Icon & branding: Sonarix custom assets di `src-tauri/icons/`.

Lyrics: LRCLib, Lyrics.ovh (opsional, user-enabled).  
Album art fetch: Cover Art Archive (opsional saat scan).

---

*Dokumentasi ini untuk halaman “Read” / project detail di portfolio. Cerita proses development ada di file terpisah: `sonarix-story.md`.*
