# Malam-malam Ngulik Player Sendiri: Sonarix

*Catatan development — bukan dokumentasi teknis.*

---

Awalnya sederhana banget: “Pengen app musik lokal yang UI-nya nggak bikin ngantuk.”

Itu aja. Nggak ada pitch deck, nggak ada target user segmen, nggak ada rencana monetisasi. Cuma frustrasi kecil setiap kali buka folder `Music` dan harus scroll file satu-satu, atau player default Windows ngasih vibe “office tool” bukan “dengerin album favorit jam 11 malam”.

---

## Dari prototype ke sesuatu yang beneran dipakai

Versi awal cuma list + play. Boring, tapi sudah cukup buat ngetes: *apakah saya betah pakai ini sendiri?*

Jawabannya: belum. Yang bikin betah baru muncul setelah ada **library scan**, **queue**, dan **player bar** yang nggak loncat-loncat. Lucunya, hal yang paling terasa “wow” bukan fitur fancy — tapi saat shuffle antrian playlist kecil terus habis, terus app-nya **lanjut random** tanpa saya harus pilih lagu lagi. Baru kerasa kayak player, bukan file browser.

Patch terakhir (v1.2.3) saya sebut auto-mix. Repeat off, antrian habis, langsung ganti random dari library. Tanpa dimasukin ke antrian. Entah kenapa saya lebih nyaman begitu — antrian tetap “milik saya”, random-nya cuma filler.

---

## Fullscreen yang akhirnya masuk akal

Sempat bikin overlay now-playing cuma satu baris lirik. Cantik di screenshot, useless pas dipakai.

Saya baru sadar fullscreen itu bukan “player bar tapi besar” — harus **self-contained**: lirik scroll, volume, shuffle, repeat. Soalnya player bar ketutup overlay; kalau kontrolnya nggak ada di situ, user stuck. Obvious in hindsight, tapi waktu coding pertama kali kepikirannya cuma cover art + judul besar.

Sekarang klik judul di player bar juga buka fullscreen. Kecil, tapi somehow lebih natural dari harus klik cover doang.

---

## Duplikat: kolom ada, UI belum

Klasik side project moment: fitur backend jalan, UI-nya belum.

`is_duplicate` sudah di database, scanner sudah mark, tapi di library nggak keliatan apa-apa. Baru di v1.2.3 saya tambahin badge kuning “Duplikat” + filter tab. Bukan duplicate manager proper (merge/hapus batch) — itu wishlist — tapi minimal koleksi FLAC dobel akhirnya bisa di-audit tanpa query manual.

---

## Bookmark pindah ke SQLite (dan malu sendiri)

Bookmark posisi disimpan di localStorage. Works, sampai saya ganti profile browser / clear data. Hilang.

Migrasi ke SQLite + auto-import dari localStorage lama. Satu lagi reminder: kalau datanya penting, jangan di localStorage doang. Obvious, tapi saya tetap kena.

---

## Tag editor vs file asli

Awalnya edit metadata cuma update library. File di disk tetap tag lama. Fine untuk testing, annoying kalau mau benerin tag beneran.

Tambah checkbox “tulis ke file asli” + Rust `lofty`. Senangnya jalan. Traumanya: dependency `tauri-plugin-autostart` sempat kehapus pas nambah crate baru, build error seminggu tidak disadari. Lesson learned: jangan edit `Cargo.toml` sambil multitask.

---

## Splash screen — vanity atau UX?

Splash pakai icon `sonarix_icon_1024` + animasi ring/glow. Agak vanity, tapi Tauri app kadang blank hitam 2–3 detik pas load SQLite library. Splash nutup jeda itu dan kasih identitas visual.

HTML splash di `index.html` supaya muncul sebelum React boot — nggak nunggu JS bundle. Fade out pas onboarding state ready.

---

## Hal kecil yang ternyata susah

- **Gapless** — Dual audio element, preload path provider, edge case shuffle pool habis
- **i18n** — String hardcode di 40 file; migrasi ke `i18n.ts` itu marathon, bukan sprint
- **Tauri permissions** — `autostart:default` hilang kalau plugin Rust nggak ada; error message panjang banget, diagnosis-nya 5 menit
- **Versi NPM vs Rust** — Warning mismatch 2.10 vs 2.11; pin versi biar tenang

---

## Perasaan saat project “usable”

Bukan saat fitur paling banyak. Saat saya buka app pagi-pagi, scan folder, shuffle album, fullscreen lirik jalan, terus nggak kepikiran buka app lain.

Itu bar-nya.

Masih banyak yang bisa ditambah (Last.fm OAuth, visualizer fullscreen, duplicate manager). Tapi Sonarix sudah dari “project ngulik” jadi **tool harian** — dan itu milestone yang lebih penting dari checklist fitur.

---

## Refleksi singkat

Kalau ada yang mau bikin app serupa:

1. Ship playable dulu, polish later  
2. Library + playback loop harus solid sebelum smart recommendation  
3. Jangan campur dokumentasi dengan cerita — (ya, saya pisahin file ini dari `sonarix-documentation.md` sengaja)  
4. Side project survive kalau **kamu sendiri** mau pakai setiap hari  

Sonarix masih jauh dari perfect. Tapi setiap patch kecil — auto-mix, splash, filter duplikat — rasanya seperti merapikan meja kerja sendiri. Bukan untuk demo. Untuk dipakai.

---

*Ini konten blog / journal. Untuk spesifikasi fitur & setup, baca `sonarix-documentation.md`.*
