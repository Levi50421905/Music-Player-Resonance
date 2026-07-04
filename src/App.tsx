/**
 * App.tsx — v10 (Settings Init + Global i18n + FolderWatch)
 * ==========================================================
 * LETAKKAN FILE INI DI: src/App.tsx (GANTIKAN App.tsx yang ada)
 *
 * PERUBAHAN vs v9:
 *   [NEW] useSettingsInit() — apply semua settings ke DOM saat startup
 *         (tema, warna aksen, font size, dll langsung aktif tanpa buka Settings)
 *   [NEW] useFolderWatch()  — auto-watch folder yang tersimpan di settings
 *   [FIX] useLang() dipanggil di App sehingga label tab nav berubah sesuai bahasa
 *   [FIX] Tab labels sekarang mengikuti bahasa aktif (Indonesia/English)
 *
 * TIDAK ADA PERUBAHAN LAIN — semua logic yang sudah ada tetap sama persis.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { audioEngine, enqueueBgDecode } from "./lib/audioEngine";
import type { PreloadState } from "./lib/audioEngine";
import {
  getDb, getAllSongs, setRating, recordPlay, getPlaylists, getSetting, getPlayHistory,
  migrateBase64CoversBatch,
} from "./lib/db";
import { scanFolder, addFiles, importPaths, scanOptionsFromSettings } from "./lib/scanner";
import { usePlayerStore, useLibraryStore, useSettingsStore, enrichFromLibrary, waitForPlayerHydration, prunePlayerContext } from "./store";
import { useMiniPlayer, useMiniPlayerCommands } from "./components/Player/useMiniPlayer";
import { useKeyboardShortcuts } from "./components/Player/useKeyboardShortcuts";
import { useTrackNotification, requestNotificationPermission } from "./components/Notification/useTrackNotification";
import type { Song } from "./lib/db";
import { enrichPlayRecord } from "./lib/parsePlayedAt";
import { hydrateBookmarks } from "./lib/bookmarks";

// ── [NEW] Import 3 hal baru ──────────────────────────────────────────────────
import { usePlaybackPersist, applyPendingSeek, restorePlaybackSession } from "./hooks/usePlaybackPersist";
import { useSettingsInit } from "./hooks/useSettingsInit";   // ← [NEW]
import { useFolderWatch } from "./lib/useFolderWatch";        // ← [NEW] sudah ada, tinggal import
import { useLang } from "./lib/i18n";                         // ← [NEW] untuk label tab

import Onboarding from "./components/Onboarding/Onboarding";
import Sidebar from "./components/Sidebar";
import LibraryView from "./components/Library/LibraryView";
import QueueSidePanel from "./components/Player/QueueSidePanel";
import EqualizerView from "./components/Equalizer/EqualizerView";
import PlaylistsView from "./components/Playlist/PlaylistsView";
import SmartPlaylistView from "./components/Smart/SmartPlaylistView";
import { AlbumView, ArtistView } from "./components/Album/AlbumView";
import Dashboard from "./components/Dashboard/Dashboard";
import PlayerBarV2 from "./components/Player/PlayerBarV2";
import ScanProgress, { EmptyLibraryState } from "./components/Library/ScanProgress";
import SettingsPanel from "./components/Settings/SettingsPanel";
import FolderView from "./components/Library/FolderView";
import FavoritesView from "./components/Library/FavoritesView";
import CommandPalette from "./components/CommandPalette";
import SleepTimerButton, { useSleepTimer, SleepTimerBanner } from "./components/Player/SleepTimer";
import KeyboardCheatsheet from "./components/KeyboardCheatsheet";
import ToastContainer, { toastSuccess, toastError, toastInfo } from "./components/Notification/ToastSystem";
import { useMediaKeys } from "./hooks/useMediaKeys";
import { useSystemIntegration } from "./hooks/useSystemIntegration";
import { useSkipSilence } from "./hooks/useSkipSilence";
import { useDynamicTheme } from "./hooks/useDynamicTheme";
import NowPlayingFullscreen from "./components/Player/NowPlayingFullscreen";
import { generateRadioQueue, pickRandomNextSong } from "./lib/radioEngine";
import { scrobbleTrack, updateNowPlaying } from "./lib/lastfm";
import { hideAppSplash } from "./lib/appSplash";
import { dismissNewTrack } from "./lib/newTrack";

export type ActiveTab =
  | "home" | "library" | "favorites" | "albums" | "artists"
  | "smart" | "queue" | "equalizer" | "playlists" | "folders";

// ── SVG Icons (tidak berubah dari v9) ────────────────────────────────────────

const Icons = {
  home: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z"/>
      <path d="M6 15V9h4v6"/>
    </svg>
  ),
  library: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 14A6 6 0 108 2a6 6 0 000 12z"/>
      <circle cx="8" cy="8" r="2"/>
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2"/>
    </svg>
  ),
  albums: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="10" height="10" rx="1.5"/>
      <rect x="4" y="1" width="10" height="10" rx="1.5"/>
      <circle cx="6" cy="8" r="1.5"/>
    </svg>
  ),
  artists: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5" r="3"/>
      <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
    </svg>
  ),
  folders: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4.5A1.5 1.5 0 012.5 3h3l2 2h6A1.5 1.5 0 0115 6.5v6a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12V4.5z"/>
    </svg>
  ),
  smart: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10 4.4 12l.7-4L2.2 5.2l4-.6L8 1z"/>
    </svg>
  ),
  favorites: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13.5l-1.2-1.1C3.5 9.5 1 7.3 1 4.8 1 2.9 2.4 1.5 4.2 1.5c1.1 0 2.1.5 2.8 1.3L8 4.2l1-1.4c.7-.8 1.7-1.3 2.8-1.3 1.8 0 3.2 1.4 3.2 3.3 0 2.5-2.5 4.7-5.8 7.6L8 13.5z"/>
    </svg>
  ),
  queue: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M2 8h8M2 12h10"/>
      <circle cx="12" cy="11" r="3"/>
      <path d="M11 9.5l2 1.5-2 1.5"/>
    </svg>
  ),
  equalizer: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v12M4 6h-2M4 6h2M8 2v12M8 10h-2M8 10h2M12 2v12M12 4h-2M12 4h2"/>
    </svg>
  ),
  playlists: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M2 8h8M2 12h8"/>
      <path d="M11 10.5l4-2v5l-4-2v-1z"/>
    </svg>
  ),
  scan: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 4V2.5A1 1 0 012.5 1.5H4M12 1.5h1.5a1 1 0 011 1V4M14.5 12v1.5a1 1 0 01-1 1H12M4 14.5H2.5a1 1 0 01-1-1V12"/>
      <circle cx="8" cy="8" r="3"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M8 3v10M3 8h10"/>
    </svg>
  ),
  mini: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="12" height="8" rx="1.5"/>
      <path d="M5 9h6M7 7l2 2-2 2"/>
    </svg>
  ),
  keyboard: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3.5" width="14" height="9" rx="1.5"/>
      <path d="M4 7h1M7 7h1M10 7h1M4 10h8M13 7h.01"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10A6 6 0 016 2a7 7 0 100 12 6 6 0 008-4z"/>
    </svg>
  ),
};

export default function App() {
  // ═══════════════════════════════════════════════════════════════════════════
  // [KEY #1] SETTINGS INIT — Apply settings ke DOM saat app pertama dibuka
  // Ini yang fix masalah: tema/warna/font tidak ter-apply sampai buka Settings
  // ═══════════════════════════════════════════════════════════════════════════
  useSettingsInit();
// Resume AudioContext saat user interaction pertama (wajib untuk autoplay policy)
useEffect(() => {
  const resume = () => {
    const ctx = (audioEngine as any).ctx as AudioContext | null;
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener("click", resume, { once: true });
  window.addEventListener("keydown", resume, { once: true });
  window.addEventListener("touchstart", resume, { once: true });
  return () => {
    window.removeEventListener("click", resume);
    window.removeEventListener("keydown", resume);
    window.removeEventListener("touchstart", resume);
  };
}, []);
  // ═══════════════════════════════════════════════════════════════════════════
  // [KEY #2] FOLDER WATCH — Auto-watch folder yang tersimpan di settings
  // ═══════════════════════════════════════════════════════════════════════════
  useFolderWatch();

  // ═══════════════════════════════════════════════════════════════════════════
  // [KEY #3] i18n — Baca bahasa aktif agar tab nav bisa diterjemahkan
  // ═══════════════════════════════════════════════════════════════════════════
  const { lang, t } = useLang();
  const { hiddenTabs, queuePanelPosition, defaultPlaybackSpeed: defaultSpeed } = useSettingsStore() as any;

  const PRIMARY_TABS = [
    { id: "home"      as ActiveTab, label: t.navHome,      icon: Icons.home },
    { id: "library"   as ActiveTab, label: t.navLibrary,   icon: Icons.library },
    { id: "favorites" as ActiveTab, label: t.navFavorites, icon: Icons.favorites },
    { id: "albums"    as ActiveTab, label: t.navAlbums,    icon: Icons.albums },
    { id: "artists"   as ActiveTab, label: t.navArtists,   icon: Icons.artists },
    { id: "folders"   as ActiveTab, label: t.navFolders,   icon: Icons.folders },
    { id: "smart"     as ActiveTab, label: t.navSmart,     icon: Icons.smart },
  ].filter(tab => !(hiddenTabs ?? []).includes(tab.id));

  const SECONDARY_TABS = [
    { id: "equalizer" as ActiveTab, label: t.navEqualizer, icon: Icons.equalizer },
    { id: "playlists" as ActiveTab, label: t.navPlaylists, icon: Icons.playlists },
  ].filter(tab => !(hiddenTabs ?? []).includes(tab.id));

  // ── State (tidak berubah dari v9) ─────────────────────────────────────────
  const [activeTab, setActiveTab]           = useState<ActiveTab>("home");
  const [tabTransition, setTabTransition]   = useState(false);
  const [showSettings, setShowSettings]     = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [onboarding, setOnboarding]         = useState<boolean | null>(null);
  const [preloadState, setPreloadState]     = useState<PreloadState>(null);
  const [playbackSpeed, setPlaybackSpeed]   = useState(defaultSpeed ?? 1);
  const [isDragOver, setIsDragOver]         = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [abLoop, setAbLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const abLoopRef = useRef(abLoop);
  abLoopRef.current = abLoop;
  const [detailResetKey, setDetailResetKey] = useState({ albums: 0, artists: 0, folders: 0 });
  const queueRestoredRef = useRef(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("Sonarix-sidebar-collapsed") === "true"; } catch { return false; }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v;
      try { localStorage.setItem("Sonarix-sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const isInitialized  = useRef(false);

  const { timer: sleepTimer, start: startSleep, clear: clearSleep, startPauseAfterSong, shouldPauseAfterSong } = useSleepTimer();

  const {
    currentSong, isPlaying, volume, progress,
    setCurrentSong, setIsPlaying, setProgress, setCurrentTime,
    setDuration, nextTrack, prevTrack, addPlayRecord, setPlayContext,
    cycleShuffleMode, cycleRepeatMode,
    playNextTrack,
    unifiedQueue,
  } = usePlayerStore();

 const {
  songs,
  setSongs,
  setPlaylists,
  setLoading,
  setScanProgress,
  isLoading
} = useLibraryStore();
  const { eqGains, accentColor, toggleLyrics, crossfadeSec = 0, replayGainEnabled } = useSettingsStore() as any;
  const { openMini, closeMini, isMiniOpen } = useMiniPlayer();

  const handleNextRef = useRef<() => void>(() => {});
  const handlePlayPauseRef = useRef<() => void>(() => {});
  const handlePrevRef = useRef<() => void>(() => {});

  useTrackNotification();
  useDynamicTheme(currentSong);

  const mediaHandlers = useRef({ onPlayPause: () => {}, onNext: () => {}, onPrev: () => {} });
  mediaHandlers.current = {
    onPlayPause: () => handlePlayPauseRef.current(),
    onNext: () => handleNextRef.current(),
    onPrev: () => handlePrevRef.current(),
  };
  useMediaKeys(currentSong, isPlaying, {
    onPlayPause: () => mediaHandlers.current.onPlayPause(),
    onNext: () => mediaHandlers.current.onNext(),
    onPrev: () => mediaHandlers.current.onPrev(),
  });

  useSystemIntegration({
    onPlayPause: () => handlePlayPauseRef.current(),
    onNext: () => handleNextRef.current(),
    onPrev: () => handlePrevRef.current(),
  });
  useSkipSilence();

  // Sync accent color ke CSS variable saat berubah
  useEffect(() => {
    if (accentColor) document.documentElement.style.setProperty("--accent", accentColor);
  }, [accentColor]);

  useEffect(() => {
    const el  = (audioEngine as any).elA as HTMLAudioElement | null;
    const elB = (audioEngine as any).elB as HTMLAudioElement | null;
    if (el) el.playbackRate = playbackSpeed;
    if (elB) elB.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) (audioEngine as any).ctx?.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const db   = await getDb();
        const done = await getSetting(db, "onboarded");
        setOnboarding(done !== "true");
      } catch {
        setOnboarding(false);
      }
    })();
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (onboarding !== null) hideAppSplash();
  }, [onboarding]);

  useEffect(() => {
    if (isInitialized.current || onboarding === null || onboarding === true) return;
    isInitialized.current = true;

    (async () => {
      setLoading(true);
      try {
        await waitForPlayerHydration();
        const { defaultShuffleOnStart, defaultRepeatOnStart } = useSettingsStore.getState() as any;
        const ps = usePlayerStore.getState();
        const freshSession = !ps.currentSong && (ps.unifiedQueue?.length ?? 0) === 0;
        if (freshSession) {
          if (defaultShuffleOnStart) ps.setShuffleMode("all");
          if (defaultRepeatOnStart === "all") ps.setRepeatMode("repeat_all");
          else if (defaultRepeatOnStart === "one") ps.setRepeatMode("repeat_one");
          else if (defaultRepeatOnStart === "off") ps.setRepeatMode("all_stop");
        }
        const db = await getDb();
        await hydrateBookmarks();
        const [allSongs, allPlaylists, playHistory] = await Promise.all([
          getAllSongs(db),
          getPlaylists(db),
          getPlayHistory(db, 500),
        ]);
        const safeSongs = Array.isArray(allSongs) ? allSongs : [];
        setSongs(safeSongs);
        enrichFromLibrary(safeSongs);
        prunePlayerContext(safeSongs);
        setPlaylists(Array.isArray(allPlaylists) ? allPlaylists : []);
        // Populate in-memory history from DB (newest first, already sorted by query)
        if (Array.isArray(playHistory) && playHistory.length > 0) {
          // Bulk-set: directly write to store state bypassing addToHistory's 500-cap logic
          usePlayerStore.setState(s => ({
            history: playHistory.slice(0, 500).map(r => enrichPlayRecord(r)),
          }));
        }
        if ("requestIdleCallback" in window) {
          (window as any).requestIdleCallback(async () => {
            safeSongs
              .filter(s => ["flac","ape","wma","alac"].includes((s.format ?? "").toLowerCase()))
              .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
              .slice(0, 5)
              .forEach(s => enqueueBgDecode(s.path));
            try {
              const db = await getDb();
              let total = 0;
              for (let i = 0; i < 20; i++) {
                const n = await migrateBase64CoversBatch(db, 50);
                total += n;
                if (n === 0) break;
              }
              if (total > 0) console.info(`[App] Migrated ${total} cover art entries to disk`);
            } catch { /* background */ }
          }, { timeout: 8000 });
        }
        usePlayerStore.getState()._rebuildUnified();
        await restorePlaybackSession(setCurrentTime, setDuration, setProgress);
        const qLen = usePlayerStore.getState().unifiedQueue?.length ?? 0;
        if (!queueRestoredRef.current && qLen > 0) {
          queueRestoredRef.current = true;
          toastInfo(t.toastQueueRestored(qLen));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [onboarding]);

  useEffect(() => { audioEngine.setVolume(volume); }, [volume]);
  useEffect(() => { if (eqGains) audioEngine.setEqPreset(eqGains); }, [eqGains]);
  useEffect(() => { audioEngine.setCrossfade(crossfadeSec); }, [crossfadeSec]);
  useEffect(() => { audioEngine.setReplayGainEnabled(replayGainEnabled !== false); }, [replayGainEnabled]);

  useEffect(() => {
    const { gaplessEnabled, replayGainMode, monoDownmix } = useSettingsStore.getState() as any;
    audioEngine.setGaplessEnabled(gaplessEnabled !== false);
    if (replayGainMode) audioEngine.setReplayGainMode(replayGainMode);
    audioEngine.setMonoDownmix(!!monoDownmix);
  }, []);

  const playCountedRef = useRef<boolean>(false);
  const maybeRecordPlayRef = useRef<(song: Song) => void>(() => {});
  // [FIX] Debounce error handling — cegah handleNext() dipanggil berkali-kali
  const lastErrorTimeRef = useRef<number>(0);
  const errorSkipCountRef = useRef<number>(0);

  useEffect(() => {
    setAbLoop({ a: null, b: null });
  }, [currentSong?.id]);

  useEffect(() => {
    audioEngine.onTimeUpdate(t => {
      setCurrentTime(t);
      const ab = abLoopRef.current;
      if (ab.a != null && ab.b != null && ab.b > ab.a && t >= ab.b) {
        audioEngine.seek(ab.a);
        return;
      }
      if (audioEngine.duration > 0) {
        setProgress((t / audioEngine.duration) * 100);
        if (!playCountedRef.current && audioEngine.duration > 0) {
          const { playCountThreshold } = useSettingsStore.getState() as any;
          const threshold = (playCountThreshold ?? 50) / 100;
          if (t / audioEngine.duration >= 0.5) {
            const { currentSong: cs } = usePlayerStore.getState();
            if (cs) {
              dismissNewTrack(cs.id);
              useLibraryStore.getState().refreshNewBadges();
            }
          }
          if (t / audioEngine.duration >= threshold) {
            const { currentSong: cs } = usePlayerStore.getState();
            if (cs) maybeRecordPlayRef.current(cs);
          }
        }
      }
    });
    audioEngine.onLoadedMetadata(d => setDuration(d));
    audioEngine.onEnded(() => handleNextRef.current());
    audioEngine.onPreloadStateChange(s => setPreloadState(s));
    audioEngine.onError((path, message) => {
      // [FIX] Debounce: abaikan error yang terjadi dalam 3 detik dari error sebelumnya
      const now = Date.now();
      if (now - lastErrorTimeRef.current < 3000) {
        console.warn("[App] onError diabaikan (debounce):", path);
        return;
      }
      lastErrorTimeRef.current = now;

      const fileName = path.replace(/\\/g, "/").split("/").pop() ?? path;
      toastError(t.toastPlayFailed(fileName));

      // [FIX] Hanya auto-skip jika error berturut-turut tidak terlalu banyak
      // (cegah infinite skip loop jika semua lagu gagal)
      errorSkipCountRef.current += 1;
      if (errorSkipCountRef.current > 5) {
        console.error("[App] Terlalu banyak error berturut-turut, hentikan auto-skip");
        errorSkipCountRef.current = 0;
        return;
      }

      // Auto-skip ke lagu berikutnya setelah delay
      setTimeout(() => { handleNextRef.current(); }, 2000);
    });
  }, []);

  useEffect(() => {
    audioEngine.setNextPathProvider(() => {
      const state = usePlayerStore.getState();
      const { playContext, contextIndex, shuffleMode, repeatMode, _shufflePool, manualQueue } = state;
      if (manualQueue.length > 0) return manualQueue[0]?.path ?? null;
      if (repeatMode === "repeat_one") return playContext[contextIndex]?.path ?? null;
      if (shuffleMode !== "off") {
        const pool = _shufflePool as number[];
        return pool.length > 0 ? (playContext[pool[0]]?.path ?? null) : null;
      }
      const nextIdx = contextIndex + 1;
      if (nextIdx < playContext.length) return playContext[nextIdx]?.path ?? null;
      if (repeatMode === "repeat_all" || repeatMode === "repeat_category") return playContext[0]?.path ?? null;
      return null;
    });
  }, []);

  const switchTab = useCallback((tab: ActiveTab) => {
    if (tab === activeTab) {
      if (tab === "albums") setDetailResetKey(k => ({ ...k, albums: k.albums + 1 }));
      if (tab === "artists") setDetailResetKey(k => ({ ...k, artists: k.artists + 1 }));
      if (tab === "folders") setDetailResetKey(k => ({ ...k, folders: k.folders + 1 }));
      return;
    }
    setTabTransition(true);
    setTimeout(() => {
      setActiveTab(tab);
      setTabTransition(false);
    }, 80);
  }, [activeTab]);

  const queueCount = Array.isArray(unifiedQueue) ? unifiedQueue.length : 0;

  const playSong = useCallback(async (song: Song) => {
    errorSkipCountRef.current = 0;
    setCurrentSong(song);
    setIsPlaying(true);
    playCountedRef.current = false;
    try {
      await audioEngine.play(song.path);
      applyPendingSeek(song);
      // [FIX BUG 4] Set playbackRate on both slots — active slot may be elA or elB
      const elA = (audioEngine as any).elA as HTMLAudioElement | null;
      const elB = (audioEngine as any).elB as HTMLAudioElement | null;
      if (elA) elA.playbackRate = playbackSpeed;
      if (elB) elB.playbackRate = playbackSpeed;
      const { lastfmEnabled, lastfmApiKey, lastfmSessionKey, lastfmApiSecret } = useSettingsStore.getState() as any;
      if (lastfmEnabled && lastfmApiKey && lastfmSessionKey && lastfmApiSecret) {
        updateNowPlaying(song, lastfmApiKey, lastfmSessionKey, lastfmApiSecret).catch(() => {});
      }
    } catch {
      setIsPlaying(false);
      toastError("Failed to play track");
    }
  }, [playbackSpeed]);

  usePlaybackPersist({
    isLibraryReady: !isLoading && songs.length > 0,
  });

  const maybeRecordPlay = useCallback(async (song: Song) => {
    if (playCountedRef.current) return;
    const { playCountThreshold } = useSettingsStore.getState() as any;
    const threshold = (playCountThreshold ?? 50) / 100;
    const engineDur = audioEngine.duration > 0 ? audioEngine.duration : (song.duration ?? 0);
    if (engineDur <= 0) return;
    const progress = audioEngine.currentTime / engineDur;
    if (progress < threshold) return;

    playCountedRef.current = true;
    try {
      const db = await getDb();
      const record = await recordPlay(db, song.id);
      const newCount = (song.play_count ?? 0) + 1;
      setSongs((prev: any) =>
        Array.isArray(prev)
          ? prev.map((s: Song) => s.id === song.id ? { ...s, play_count: (s.play_count || 0) + 1 } : s)
          : prev
      );
      const { currentSong: cs, setCurrentSong: scs } = usePlayerStore.getState();
      if (cs && cs.id === song.id) {
        scs({ ...cs, play_count: newCount });
      }
      addPlayRecord(record);
      const { lastfmEnabled, lastfmApiKey, lastfmSessionKey, lastfmApiSecret, scrobbleThresholdSec } = useSettingsStore.getState() as any;
      if (lastfmEnabled && lastfmApiKey && lastfmSessionKey && lastfmApiSecret && audioEngine.currentTime >= (scrobbleThresholdSec ?? 30)) {
        scrobbleTrack(song, Date.now(), lastfmApiKey, lastfmSessionKey, lastfmApiSecret).catch(() => {});
      }
    } catch (err) {
      playCountedRef.current = false;
      console.warn("[App] recordPlay failed:", err);
    }
  }, [setSongs, addPlayRecord]);

  maybeRecordPlayRef.current = maybeRecordPlay;

  const playList = useCallback((list: Song[], index = 0, contextName = "") => {
    if (!Array.isArray(list) || list.length === 0) return;
    const safeIndex = Math.max(0, Math.min(index, list.length - 1));
    setPlayContext(list, safeIndex, contextName);
    playSong(list[safeIndex]);
    const nextSong = list[safeIndex + 1];
    if (nextSong?.path) audioEngine.preloadNext(nextSong.path).catch(() => {});
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => {
        list.slice(safeIndex + 2, safeIndex + 5).forEach(s => enqueueBgDecode(s.path));
      }, { timeout: 3000 });
    }
  }, [playSong]);

  const handleNext = useCallback(() => {
    if (currentSong) maybeRecordPlay(currentSong);
    if (shouldPauseAfterSong()) {
      audioEngine.pause();
      setIsPlaying(false);
      toastInfo("Sleep timer: music paused after song");
      return;
    }
    const result = nextTrack();
    if (result) {
      playSong(result.song);
      return;
    }
    const { queueEndBehavior, radioSource, radioSmartEnabled, autoMixOnQueueEnd } = useSettingsStore.getState() as any;
    const { playContext, contextName, history, currentSong: cs, repeatMode } = usePlayerStore.getState();
    if (queueEndBehavior === "loop" && playContext.length > 0) {
      playList(playContext, 0, contextName || "Queue");
      return;
    }
    if (queueEndBehavior === "radio" && songs.length > 0) {
      const radioQueue = generateRadioQueue(songs, history, {
        source: radioSource ?? "smart_mood",
        smartMood: radioSmartEnabled !== false,
        currentSong: cs,
        count: 25,
      });
      if (radioQueue.length > 0) {
        toastInfo(t.toastRadioMode);
        playList(radioQueue, 0, "Radio");
        return;
      }
    }
    const repeatActive = repeatMode === "repeat_one" || repeatMode === "repeat_all" || repeatMode === "repeat_category";
    if (autoMixOnQueueEnd !== false && !repeatActive && songs.length > 0) {
      const random = pickRandomNextSong(songs, cs, history);
      if (random) {
        playSong(random);
        return;
      }
    }
    setIsPlaying(false);
    audioEngine.stop();
  }, [nextTrack, playSong, shouldPauseAfterSong, currentSong, maybeRecordPlay, playList, songs, lang]);

  handleNextRef.current = handleNext;

  const handlePrev = useCallback(() => {
    if (audioEngine.currentTime > 3) audioEngine.seek(0);
    else {
      const prev = prevTrack();
      if (prev) playSong(prev);
    }
  }, [prevTrack, playSong]);

  const handlePlayPause = useCallback(async () => {
    if (!currentSong) return;
    if (isPlaying) { audioEngine.pause(); setIsPlaying(false); }
    else {
      const { fadeInOnResume, fadeInDuration } = useSettingsStore.getState() as any;
      if (!audioEngine.duration) await playSong(currentSong);
      else {
        if (fadeInOnResume) {
          audioEngine.fadeIn(fadeInDuration ?? 0.5);
        } else {
          audioEngine.resume();
        }
        setIsPlaying(true);
      }
    }
  }, [isPlaying, currentSong, playSong]);

  handlePlayPauseRef.current = handlePlayPause;
  handlePrevRef.current = handlePrev;

  const handleSetAbA = useCallback(() => {
    setAbLoop(s => ({ ...s, a: audioEngine.currentTime }));
  }, []);
  const handleSetAbB = useCallback(() => {
    setAbLoop(s => ({ ...s, b: audioEngine.currentTime }));
  }, []);
  const handleClearAb = useCallback(() => setAbLoop({ a: null, b: null }), []);

  const handleRating = useCallback(async (songId: number, stars: number) => {
    setSongs((prev: any) =>
      Array.isArray(prev) ? prev.map((s: Song) => s.id === songId ? { ...s, stars } : s) : prev
    );
    const { currentSong: cs, setCurrentSong: scs } = usePlayerStore.getState();
    if (cs && cs.id === songId) scs({ ...cs, stars });
    const db = await getDb();
    await setRating(db, songId, stars);
    toastSuccess(stars === 0 ? t.toastRatingCleared : t.toastRatingSaved(stars));
  }, [setSongs, t]);

  const handleScanFolder = useCallback(async () => {
    toastInfo(t.toastScanStarting);
    const scanOpts = scanOptionsFromSettings(useSettingsStore.getState() as any);
    try {
      const result = await scanFolder(p => {
        setScanProgress({ ...p, phase: p.done ? "completed" : "scanning" });
      }, scanOpts);
      const db = await getDb();
      const updated = await getAllSongs(db);
      setSongs(Array.isArray(updated) ? updated : []);
      setScanProgress(null);
      const parts = [`${result.songs.length} tracks added/updated`];
      if (result.skippedCount > 0) parts.push(`${result.skippedCount} unchanged`);
      if (result.failedFiles.length > 0) parts.push(`${result.failedFiles.length} failed`);
      toastSuccess(parts.join(" · "));
    } catch {
      toastError(t.toastScanFailed);
      setScanProgress(null);
    }
  }, []);

  const handleAddFiles = useCallback(async () => {
    const scanOpts = scanOptionsFromSettings(useSettingsStore.getState() as any);
    try {
      const added = await addFiles(p => {
        setScanProgress({ ...p, phase: p.done ? "completed" : "indexing" });
      }, scanOpts);
      const db = await getDb();
      const updated = await getAllSongs(db);
      setSongs(Array.isArray(updated) ? updated : []);
      setScanProgress(null);
      if (added.length > 0) toastSuccess(`${added.length} file(s) added`);
      else toastInfo("No new files added");
    } catch {
      toastError("Failed to add files");
      setScanProgress(null);
    }
  }, []);

  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return () => {};
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen: tauriListen } = await import("@tauri-apps/api/event");
        unlisten = await tauriListen("tauri://file-drop", async (event: any) => {
          setIsDragOver(false);
          const paths: string[] = event.payload?.paths ?? event.payload ?? [];
          if (!paths.length) return;

          toastInfo(`Adding ${paths.length} file(s)…`);
          const scanOpts = scanOptionsFromSettings(useSettingsStore.getState() as any);

          try {
            await importPaths(paths, p => {
              setScanProgress({ ...p, phase: p.done ? "completed" : "indexing" });
            }, scanOpts);

            const db = await getDb();
            const updated = await getAllSongs(db);
            setSongs(Array.isArray(updated) ? updated : []);
            setScanProgress(null);
            toastSuccess("Files added to library");
          } catch {
            toastError("Failed to add dropped files");
            setScanProgress(null);
          }
        });
        await tauriListen("tauri://file-drop-hover", () => setIsDragOver(true));
        await tauriListen("tauri://file-drop-cancelled", () => setIsDragOver(false));
      } catch {}
    })();
    return () => { unlisten?.(); };
  }, []);

  const handleOnboardingComplete = useCallback((newSongs: Song[]) => {
    setSongs(Array.isArray(newSongs) ? newSongs : []);
    setOnboarding(false);
    isInitialized.current = true;
  }, []);

  useMiniPlayerCommands({ onPlayPause: handlePlayPause, onNext: handleNext, onPrev: handlePrev });

useEffect(() => {
  if (!(window as any).__TAURI_INTERNALS__) return () => {};

  const uns: (() => void)[] = [];

  (async () => {
    uns.push(await listen("media:playpause", handlePlayPause));
    uns.push(await listen("media:next", handleNext));
    uns.push(await listen("media:prev", handlePrev));
  })();

  return () => uns.forEach(f => f());
}, [handlePlayPause, handleNext, handlePrev]);

  useKeyboardShortcuts({
  onPlayPause: handlePlayPause,
  onNext: handleNext,
  onPrev: handlePrev,
  onRating: (songId: number, stars: number) => handleRating(songId, stars),
  onToggleShuffle: () => {
      cycleShuffleMode();
      const { shuffleMode: ns } = usePlayerStore.getState();
      const labels: Record<string, string> = {
        off: "Shuffle off", all: "Shuffle on",
        songs: "Shuffle songs", songs_and_categories: "Shuffle all",
      };
      toastInfo(labels[ns] ?? "Shuffle");
    },
    onCycleRepeat: cycleRepeatMode,
    onToggleMini: () => isMiniOpen() ? closeMini() : openMini(),
    onToggleLyrics: toggleLyrics,
    onOpenSettings: () => setShowSettings(s => !s),
    onFocusSearch: () => {
      switchTab("library");
      setTimeout(() => searchInputRef.current?.focus(), 50);
    },
    onOpenSleepTimer: () => startSleep(15),
    onOpenCommandPalette: () => setShowCommandPalette(true),
    onToggleQueue: () => setShowQueuePanel(v => !v),
    onToggleCheatsheet: () => setShowCheatsheet(s => !s),
    onToggleFullscreen: () => setShowNowPlaying(v => !v),
  });

  const navigateTab = useCallback((tab: string) => {
    switchTab(tab as ActiveTab);
  }, [switchTab]);

  // Splash handled by index.html until onboarding state is known
  if (onboarding === null) return null;

  if (onboarding) return <Onboarding onComplete={handleOnboardingComplete} />;

  return (
    <div className="app-root">
      {/* Drag & drop overlay */}
      {isDragOver && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(124,58,237,0.12)",
          border: "2px dashed rgba(124,58,237,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12, pointerEvents: "none",
        }}>
          <div style={{ fontSize: 40, opacity: 0.7 }}>♫</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#a78bfa" }}>Drop to add to library</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>MP3, FLAC, WAV, OGG and more</p>
        </div>
      )}

      <ScanProgress />
      <ToastContainer />
      <KeyboardCheatsheet open={showCheatsheet} onClose={() => setShowCheatsheet(false)} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <div className="layout">
        <Sidebar
          onPlayPause={handlePlayPause}
          onRating={handleRating}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        <div className="content">
          {/* ── Tab Navigation ── */}
          <nav className="tab-nav">
            {/* Logo */}
            <div className="logo">
              <img className="logo-icon" src="/sonarix_icon_1024.png" alt="Sonarix" />
              <span className="logo-text">Sonarix</span>
            </div>

            {/* Primary tabs */}
            <div className="tabs">
              {PRIMARY_TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => switchTab(tab.id)}
                  title={tab.label}
                >
                  {tab.icon}
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Toolbar right */}
            <div className="toolbar">
              {/* Secondary tabs */}
              <div className="secondary-tabs">
                {SECONDARY_TABS.map(tab => (
                  <button
                    key={tab.id}
                    className={`secondary-tab-btn ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => switchTab(tab.id)}
                    title={tab.label}
                  >
                    {tab.icon}
                    <span className="secondary-tab-label">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="nav-divider" />

              <button
                className={`icon-btn ${showQueuePanel ? "active" : ""}`}
                onClick={() => setShowQueuePanel(v => !v)}
                title={t.queueTitle}
                style={{ position: "relative" }}
              >
                {Icons.queue}
                {queueCount > 0 && (
                  <span style={{
                    position: "absolute", top: -4, right: -4,
                    minWidth: 16, height: 16, padding: "0 4px",
                    borderRadius: 8, fontSize: 9, fontWeight: 700,
                    background: "var(--accent)", color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "monospace",
                  }}>
                    {queueCount > 99 ? "99+" : queueCount}
                  </span>
                )}
              </button>

              <SleepTimerButton
                timer={sleepTimer}
                onStart={startSleep}
                onClear={clearSleep}
                onPauseAfterSong={startPauseAfterSong}
              />

              <button className="icon-btn" onClick={handleScanFolder} title="Scan folder">
                {Icons.scan}
              </button>
              <button className="icon-btn" onClick={handleAddFiles} title="Add files">
                {Icons.plus}
              </button>
              <button className="icon-btn" onClick={() => isMiniOpen() ? closeMini() : openMini()} title="Mini player (Ctrl+M)">
                {Icons.mini}
              </button>
              <button className="icon-btn" onClick={() => setShowCheatsheet(s => !s)} title="Keyboard shortcuts">
                {Icons.keyboard}
              </button>
              <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings (Ctrl+,)">
                {Icons.settings}
              </button>
            </div>
          </nav>

          {/* Tab content */}
          <div
            className="tab-content"
            style={{ opacity: tabTransition ? 0 : 1, transition: "opacity 0.08s ease" }}
          >
            {activeTab === "home" && (
              <Dashboard onPlay={playList} onRating={handleRating} onScanFolder={handleScanFolder} />
            )}

            {activeTab === "library" && (
              songs.length === 0 ? (
                <EmptyLibraryState onScanFolder={handleScanFolder} onAddFiles={handleAddFiles} />
              ) : (
                <LibraryView
                  onPlay={(song, contextList) => {
                    if (contextList && contextList.length > 0) {
                      const idx = contextList.findIndex(s => s.id === song.id);
                      const MAX_CTX = 300;
                      if (contextList.length > MAX_CTX && idx >= 0) {
                        const start = Math.max(0, idx - 50);
                        const end = Math.min(contextList.length, start + MAX_CTX);
                        const slice = contextList.slice(start, end);
                        playList(slice, idx - start, "Library");
                      } else {
                        playList(contextList, idx >= 0 ? idx : 0, "Library");
                      }
                    } else {
                      playList([song], 0);
                    }
                  }}
                  onRating={handleRating}
                  searchRef={searchInputRef}
                  onPlayNext={(song) => {
                    playNextTrack(song);
                    toastInfo(`"${song.title}" will play next`);
                  }}
                />
              )
            )}

            {activeTab === "favorites" && (
              <FavoritesView onPlay={playList} onRating={handleRating} />
            )}

            {activeTab === "albums"  && <AlbumView onPlay={(list, idx) => playList(list, idx ?? 0, "Album")} resetKey={detailResetKey.albums} />}
            {activeTab === "artists" && <ArtistView onPlay={(list, idx) => playList(list, idx ?? 0, "Artist")} resetKey={detailResetKey.artists} />}
            {activeTab === "folders" && <FolderView onPlay={(list, idx, folderName) => playList(list, idx ?? 0, folderName ?? "Folder")} resetKey={detailResetKey.folders} />}
            {activeTab === "smart"   && <SmartPlaylistView onPlay={(list, idx) => playList(list, idx ?? 0, "Smart")} />}
            {activeTab === "equalizer" && <EqualizerView />}
            {activeTab === "playlists" && (
              <PlaylistsView
                onPlay={song => playSong(song)}
                onPlayAll={songs => playList(songs, 0, "Playlist")}
              />
            )}
          </div>

          <QueueSidePanel
            open={showQueuePanel}
            onClose={() => setShowQueuePanel(false)}
            queueCount={queueCount}
            position={queuePanelPosition ?? "right"}
            onPlay={song => playSong(song)}
            onPlayFromQueue={(list, idx, name) => playList(list, idx, name)}
          />
        </div>
      </div>

      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        songs={songs}
        onPlay={(song, list) => {
          const idx = list.findIndex(s => s.id === song.id);
          playList(list, idx >= 0 ? idx : 0, "Search");
        }}
        onNavigate={navigateTab}
      />

      <NowPlayingFullscreen
        open={showNowPlaying}
        onClose={() => setShowNowPlaying(false)}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
        progress={progress}
        isPlaying={isPlaying}
      />

      <PlayerBarV2
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrev={handlePrev}
        onRating={handleRating}
        preloadState={preloadState}
        playbackSpeed={playbackSpeed}
        onSpeedChange={setPlaybackSpeed}
        sleepTimer={sleepTimer}
        onClearSleepTimer={clearSleep}
        abLoop={abLoop}
        onSetAbA={handleSetAbA}
        onSetAbB={handleSetAbB}
        onClearAb={handleClearAb}
        onOpenFullscreen={() => setShowNowPlaying(true)}
      />
    </div>
  );
}