# Changelog

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

### Saran UI/UX yang diimplementasi
1. Panel antrian samping
2. Badge jumlah antrian
3. Shortcut sleep timer
5. Toast restore antrian

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

## v1.0.3
Versi sebelumnya — smart shuffle dasar, replay gain, gapless, EQ, LRC sync, folder watch.
