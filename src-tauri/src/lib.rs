/**
 * lib.rs — Resonance Tauri backend v5
 *
 * TAMBAHAN vs v4:
 *   [NEW] watch_folder / unwatch_folder commands menggunakan
 *         tauri-plugin-fs watch API untuk deteksi file baru
 *         tanpa intervensi user. Event dikirim ke frontend via
 *         app.emit("fs:file-added", path).
 */

use std::path::{Path, PathBuf};
use std::io::Write;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use tauri::{Manager, Emitter, WindowEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tokio::sync::Semaphore;
use tokio::sync::OnceCell;
use tokio::sync::Mutex as AsyncMutex;

// Semaphore decode yang benar-benar shared
static DECODE_SEM: OnceCell<Arc<Semaphore>> = OnceCell::const_new();

// Synced from frontend settings (closeToTray)
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);

async fn decode_semaphore() -> Arc<Semaphore> {
    DECODE_SEM
        .get_or_init(|| async { Arc::new(Semaphore::new(2)) })
        .await
        .clone()
}

// Watcher registry: path → watcher handle
// Kita simpan sebagai Arc<AsyncMutex<HashMap>> agar bisa di-share antar thread
static WATCHERS: OnceCell<Arc<AsyncMutex<HashMap<String, WatchHandle>>>> = OnceCell::const_new();

async fn watchers() -> Arc<AsyncMutex<HashMap<String, WatchHandle>>> {
    WATCHERS
        .get_or_init(|| async {
            Arc::new(AsyncMutex::new(HashMap::new()))
        })
        .await
        .clone()
}

// Handle untuk mematikan watcher saat unwatch
struct WatchHandle {
    _stop: tokio::sync::oneshot::Sender<()>,
}

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "aac", "m4a", "mp4", "m4b", "alac", "wma", "opus", "ape"
];

fn is_audio_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .build(),
        )
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "tray_show", "Show Sonarix", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let icon = app.default_window_icon().cloned();
            let mut builder = TrayIconBuilder::new().menu(&menu);
            if let Some(icon) = icon {
                builder = builder.icon(icon);
            }

            builder
                .tooltip("Sonarix")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "tray_show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "tray_quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            let app_handle = app.handle().clone();
            if let Some(main_win) = app.get_webview_window("main") {
                main_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                            api.prevent_close();
                            if let Some(w) = app_handle.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        } else {
                            if let Some(mini) = app_handle.get_webview_window("mini") {
                                let _ = mini.close();
                            }
                            app_handle.exit(0);
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_close_to_tray,
            quit_app,
            get_app_version,
            get_exe_dir,
            read_file_prefix,
            read_file_suffix,
            open_file_manager,
            decode_audio_to_cache,
            get_cache_path,
            get_cache_size,
            evict_audio_cache,
            get_track_meta,
            decode_audio_to_wav,
            check_audio_support,
            watch_folder,    // [NEW]
            unwatch_folder,  // [NEW]
            list_watch_folders, // [NEW]
            unblock_file,       // Windows Zone.Identifier
            write_audio_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn cache_dir_from_handle(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Gagal resolve app_local_data_dir: {}", e))?;
    let dir = base.join("audio_cache");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Gagal buat cache dir: {}", e))?;
    Ok(dir)
}

fn fnv1a_64(input: &str) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in input.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn cache_path_for(dir: &Path, source_path: &str) -> PathBuf {
    let hash = fnv1a_64(source_path);
    dir.join(format!("{:016x}.wav", hash))
}

// ─── [NEW] Folder Watch Commands ──────────────────────────────────────────────

/// Mulai watch folder. Setiap kali file audio baru ditambahkan,
/// emit event "fs:file-added" ke frontend dengan path file.
#[tauri::command]
async fn watch_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let watchers = watchers().await;
    let mut map = watchers.lock().await;

    // Sudah di-watch → skip
    if map.contains_key(&path) {
        return Ok(());
    }

    let watch_path = PathBuf::from(&path);
    if !watch_path.exists() {
        return Err(format!("Path tidak ditemukan: {}", path));
    }

    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    let app_clone = app.clone();
    let watch_path_clone = watch_path.clone();
    let path_clone = path.clone();

    tokio::spawn(async move {
        // Polling setiap 5 detik — sederhana dan cross-platform
        // Tauri v2 plugin-fs watch masih experimental; polling lebih stabil
        let mut known_files: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

        // Inisialisasi dengan file yang sudah ada
        if let Ok(entries) = collect_audio_files(&watch_path_clone) {
            known_files.extend(entries);
        }

        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    break;
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(30)) => {
                    match collect_audio_files(&watch_path_clone) {
                        Ok(current_files) => {
                            let current_set: std::collections::HashSet<PathBuf> =
                                current_files.into_iter().collect();

                            // File baru = ada di current tapi tidak di known
                            for new_file in current_set.difference(&known_files) {
                                let file_str = new_file.to_string_lossy().to_string();
                                // Emit ke frontend
                                let _ = app_clone.emit("fs:file-added", file_str);
                            }

                            known_files = current_set;
                        }
                        Err(_) => {
                            // Folder mungkin dihapus — hentikan watcher
                            break;
                        }
                    }
                }
            }
        }
    });

    map.insert(path, WatchHandle { _stop: stop_tx });
    Ok(())
}

/// Hentikan watch folder.
#[tauri::command]
async fn unwatch_folder(path: String) -> Result<(), String> {
    let watchers = watchers().await;
    let mut map = watchers.lock().await;

    if map.remove(&path).is_some() {
        Ok(())
    } else {
        Err(format!("Folder tidak sedang di-watch: {}", path))
    }
}

/// Daftar folder yang sedang di-watch.
#[tauri::command]
async fn list_watch_folders() -> Vec<String> {
    let watchers = watchers().await;
    let map = watchers.lock().await;
    map.keys().cloned().collect()
}

fn collect_audio_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    collect_recursive(dir, &mut files)
        .map_err(|e| format!("Gagal scan: {}", e))?;
    Ok(files)
}

fn collect_recursive(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            // Abaikan hidden directories
            if path.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with('.'))
                .unwrap_or(false)
            {
                continue;
            }
            let _ = collect_recursive(&path, out);
        } else if is_audio_file(&path) {
            out.push(path);
        }
    }
    Ok(())
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    if let Some(mini) = app.get_webview_window("mini") {
        let _ = mini.close();
    }
    app.exit(0);
}

// ─── Commands (sama seperti sebelumnya) ───────────────────────────────────────

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    std::env::current_exe()
        .map_err(|e| e.to_string())
        .and_then(|p| {
            p.parent()
                .map(|d| d.to_string_lossy().to_string())
                .ok_or_else(|| "No parent dir".to_string())
        })
}

#[tauri::command]
fn read_file_prefix(path: String, len: u64) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let cap = len.min(8 * 1024 * 1024) as usize;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; cap];
    let n = file.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(buf)
}

#[tauri::command]
fn read_file_suffix(path: String, len: u64) -> Result<Vec<u8>, String> {
    use std::io::{Read, Seek, SeekFrom};
    let cap = len.min(16 * 1024 * 1024) as u64;
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let read_len = cap.min(size) as usize;
    let start = size.saturating_sub(read_len as u64);
    file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; read_len];
    let n = file.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    Ok(buf)
}

#[tauri::command]
async fn get_track_meta(path: String) -> Result<serde_json::Value, String> {
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "flac" {
        match claxon::FlacReader::open(&path) {
            Ok(reader) => {
                let info = reader.streaminfo();
                let duration_secs = if info.sample_rate > 0 {
                    info.samples.unwrap_or(0) as f64 / info.sample_rate as f64
                } else {
                    0.0
                };
                let mut rg_gain: f64 = 0.0;
                for tag in reader.tags() {
                    let key = tag.0.to_uppercase();
                    if key == "R128_TRACK_GAIN" || key == "REPLAYGAIN_TRACK_GAIN" {
                        let val_str = tag.1.trim().trim_end_matches(" dB");
                        if let Ok(v) = val_str.parse::<f64>() {
                            rg_gain = v;
                            break;
                        }
                    }
                }
                return Ok(serde_json::json!({
                    "duration": duration_secs,
                    "sampleRate": info.sample_rate,
                    "channels": info.channels,
                    "bitsPerSample": info.bits_per_sample,
                    "replayGain": rg_gain,
                }));
            }
            Err(_) => {}
        }
    }

    Ok(serde_json::json!({ "duration": null, "replayGain": 0.0 }))
}

#[tauri::command]
async fn decode_audio_to_cache(
    app: tauri::AppHandle,
    path: String,
) -> Result<String, String> {
    let dir   = cache_dir_from_handle(&app)?;
    let cache = cache_path_for(&dir, &path);

    if cache.exists() {
        return Ok(cache.to_string_lossy().into_owned());
    }

    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let sem = decode_semaphore().await;
    let _permit = sem
        .acquire()
        .await
        .map_err(|e| format!("Semaphore acquire error: {}", e))?;

    let path_clone  = path.clone();
    let _cache_clone = cache.clone();

    let wav_bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        match ext.as_str() {
            "flac" => decode_flac(&path_clone),
            "wav"  => std::fs::read(&path_clone)
                .map_err(|e| format!("Gagal baca WAV: {}", e)),
            "m4a" | "mp4" | "m4b" | "aac" | "alac" => decode_symphonia(&path_clone),
            other  => Err(format!("Format tidak didukung untuk decode: {}", other)),
        }
    })
    .await
    .map_err(|e| format!("Decode task error: {}", e))??;

    let tmp = cache.with_extension("tmp");
    {
        let mut f = std::fs::File::create(&tmp)
            .map_err(|e| format!("Gagal buat file temp: {}", e))?;
        f.write_all(&wav_bytes)
            .map_err(|e| format!("Gagal tulis cache: {}", e))?;
    }
    std::fs::rename(&tmp, &cache)
        .map_err(|e| format!("Gagal rename cache: {}", e))?;

    Ok(cache.to_string_lossy().into_owned())
}

#[tauri::command]
fn get_cache_path(app: tauri::AppHandle, source_path: String) -> String {
    match cache_dir_from_handle(&app) {
        Ok(dir) => {
            let p = cache_path_for(&dir, &source_path);
            if p.exists() { p.to_string_lossy().into_owned() } else { String::new() }
        }
        Err(_) => String::new(),
    }
}

#[tauri::command]
fn get_cache_size(app: tauri::AppHandle) -> Result<u64, String> {
    let dir = cache_dir_from_handle(&app)?;
    let total = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum();
    Ok(total)
}

#[tauri::command]
async fn evict_audio_cache(app: tauri::AppHandle, max_bytes: u64) -> Result<u64, String> {
    let dir = cache_dir_from_handle(&app)?;

    let mut entries: Vec<(PathBuf, u64, std::time::SystemTime)> = Vec::new();
    if let Ok(read) = std::fs::read_dir(&dir) {
        for entry in read.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("wav") {
                if let Ok(meta) = p.metadata() {
                    let mtime = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                    entries.push((p, meta.len(), mtime));
                }
            }
        }
    }

    let total: u64 = entries.iter().map(|(_, sz, _)| sz).sum();
    if total <= max_bytes { return Ok(total); }

    entries.sort_by_key(|(_, _, t)| *t);

    let mut freed = 0u64;
    let to_free   = total - max_bytes;
    for (path, size, _) in entries {
        if freed >= to_free { break; }
        if std::fs::remove_file(&path).is_ok() { freed += size; }
    }

    Ok(total - freed)
}

#[tauri::command]
async fn decode_audio_to_wav(app: tauri::AppHandle, path: String) -> Result<String, String> {
    decode_audio_to_cache(app, path).await
}

#[tauri::command]
fn check_audio_support() -> Vec<String> {
    vec![
        "mp3".into(), "aac".into(), "m4a".into(), "alac".into(),
        "wav".into(), "ogg".into(), "opus".into(), "flac".into(),
    ]
}

#[tauri::command]
fn unblock_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Hapus Zone.Identifier ADS secara native — tanpa spawn PowerShell
        let zone_path = format!("{}:Zone.Identifier", path);
        match std::fs::remove_file(&zone_path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("Gagal unblock file: {}", e)),
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Ok(())
    }
}

#[tauri::command]
async fn open_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let folder = Path::new(&path).parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        std::process::Command::new("explorer").arg(&folder).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg("-R").arg(&path).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let folder = Path::new(&path).parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        std::process::Command::new("xdg-open").arg(&folder).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─── Write ID3 / FLAC / etc. metadata tags ───────────────────────────────────

#[derive(serde::Deserialize)]
struct MetadataInput {
    path: String,
    title: String,
    artist: String,
    album: String,
    genre: String,
    year: Option<u32>,
}

#[tauri::command]
fn write_audio_metadata(input: MetadataInput) -> Result<(), String> {
    use lofty::config::WriteOptions;
    use lofty::file::{AudioFile, TaggedFileExt};
    use lofty::probe::Probe;
    use lofty::tag::{Accessor, Tag, TagType};

    let path = Path::new(&input.path);
    if !path.is_file() {
        return Err(format!("File tidak ditemukan: {}", input.path));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let tag_type = match ext.as_str() {
        "mp3" | "mp2" | "mp4" | "m4a" | "m4b" | "aac" => TagType::Id3v2,
        "flac" => TagType::VorbisComments,
        "ogg" | "opus" => TagType::VorbisComments,
        "wav" => TagType::Id3v2,
        _ => TagType::Id3v2,
    };

    let mut tagged = Probe::open(path)
        .map_err(|e| format!("Gagal buka file: {}", e))?
        .guess_file_type()
        .map_err(|e| format!("Format tidak dikenali: {}", e))?
        .read()
        .map_err(|e| format!("Gagal baca metadata: {}", e))?;

    let mut tag = tagged
        .primary_tag()
        .cloned()
        .or_else(|| tagged.first_tag().cloned())
        .unwrap_or_else(|| Tag::new(tag_type));

    tag.set_title(input.title);
    tag.set_artist(input.artist);
    tag.set_album(input.album);
    tag.set_genre(input.genre);
    if let Some(y) = input.year {
        tag.set_year(y);
    }

    tagged.insert_tag(tag);
    tagged
        .save_to_path(path, WriteOptions::default())
        .map_err(|e| format!("Gagal tulis tag: {}", e))?;

    Ok(())
}

// ─── Symphonia decode (M4A/AAC/ALAC) ────────────────────────────────────────

fn decode_symphonia(path: &str) -> Result<Vec<u8>, String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
    use symphonia::core::errors::Error;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let file = std::fs::File::open(path)
        .map_err(|e| format!("Gagal buka file: {}", e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Format audio tidak didukung: {}", e))?;

    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "Tidak ada track audio".to_string())?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Codec audio tidak didukung: {}", e))?;

    let mut sample_buf: Option<SampleBuffer<f32>> = None;
    let mut pcm_samples: Vec<i16> = Vec::new();
    let mut sample_rate = 44_100u32;
    let mut channels = 2u16;

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::ResetRequired) => {
                decoder = symphonia::default::get_codecs()
                    .make(&codec_params, &DecoderOptions::default())
                    .map_err(|e| format!("Decoder reset gagal: {}", e))?;
                continue;
            }
            Err(Error::IoError(ref err)) if err.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                if sample_buf.is_none() {
                    let spec = *decoded.spec();
                    sample_rate = spec.rate;
                    channels = spec.channels.count() as u16;
                    sample_buf = Some(SampleBuffer::<f32>::new(decoded.capacity() as u64, spec));
                }

                if let Some(buf) = sample_buf.as_mut() {
                    buf.copy_interleaved_ref(decoded);
                    for &s in buf.samples() {
                        let v = (s.clamp(-1.0, 1.0) * 32_767.0).round() as i16;
                        pcm_samples.push(v);
                    }
                }
            }
            Err(Error::IoError(_)) | Err(Error::DecodeError(_)) => continue,
            Err(e) => return Err(format!("Decode gagal: {}", e)),
        }
    }

    if pcm_samples.is_empty() {
        return Err("Tidak ada audio yang berhasil didecode".to_string());
    }

    samples_to_wav(&pcm_samples, sample_rate, channels)
}

fn samples_to_wav(samples: &[i16], sample_rate: u32, channels: u16) -> Result<Vec<u8>, String> {
    let mut wav_data = Vec::new();
    {
        let spec = hound::WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(std::io::Cursor::new(&mut wav_data), spec)
            .map_err(|e| format!("Gagal buat WAV: {}", e))?;
        for &s in samples {
            writer
                .write_sample(s)
                .map_err(|e| format!("Gagal tulis sample: {}", e))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("Gagal finalize WAV: {}", e))?;
    }
    Ok(wav_data)
}

// ─── FLAC decode ──────────────────────────────────────────────────────────────

fn decode_flac(path: &str) -> Result<Vec<u8>, String> {
    use claxon::FlacReader;

    let reader = FlacReader::open(path)
        .map_err(|e| format!("Gagal buka FLAC: {}", e))?;
    let info            = reader.streaminfo();
    let sample_rate     = info.sample_rate;
    let channels        = info.channels as u16;
    let bits_per_sample = info.bits_per_sample as u16;

    let mut reader2 = FlacReader::open(path)
        .map_err(|e| format!("Gagal buka FLAC kedua kali: {}", e))?;

    let estimated_samples = info.samples.unwrap_or(0) as usize;
    let mut samples: Vec<i32> = Vec::with_capacity(estimated_samples.min(50_000_000));

    let mut iter = reader2.samples();
    while let Some(s) = iter.next() {
        samples.push(s.map_err(|e| format!("Error sample FLAC: {}", e))?);
    }

    pcm_to_wav(&samples, sample_rate, channels, bits_per_sample)
}

fn pcm_to_wav(
    samples: &[i32],
    sample_rate: u32,
    channels: u16,
    bits_per_sample: u16,
) -> Result<Vec<u8>, String> {
    let bytes_per_sample = (bits_per_sample / 8) as usize;
    let data_size        = samples.len() * bytes_per_sample;
    let file_size        = 36 + data_size;

    let mut wav = Vec::with_capacity(44 + data_size);

    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(file_size as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    let byte_rate   = sample_rate * channels as u32 * bits_per_sample as u32 / 8;
    let block_align = channels * bits_per_sample / 8;
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data_size as u32).to_le_bytes());

    for &sample in samples {
        match bits_per_sample {
            8  => wav.push((sample as i8 as i16 + 128) as u8),
            16 => wav.extend_from_slice(&(sample as i16).to_le_bytes()),
            24 => { let b = sample.to_le_bytes(); wav.push(b[0]); wav.push(b[1]); wav.push(b[2]); }
            32 => wav.extend_from_slice(&sample.to_le_bytes()),
            _  => return Err(format!("bits_per_sample tidak didukung: {}", bits_per_sample)),
        }
    }

    Ok(wav)
}