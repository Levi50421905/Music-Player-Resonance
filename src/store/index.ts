/**
 * store/index.ts — v10 (Queue & Shuffle Fix)
 *
 * PERUBAHAN vs v9:
 *   [FIX] nextTrack() — saat shuffle aktif, _shufflePool dikonsumsi dengan benar
 *         (elemen pertama pool diambil dan dihapus dari pool)
 *   [FIX] nextTrack() — setelah setPlayContext() + playSong(), queue langsung
 *         mengikuti lagu yang sedang diplay (contextIndex terupdate sebelum rebuild)
 *   [FIX] setPlayContext() — rebuild unified SETELAH set semua state atomik
 *   [FIX] Shuffle pool dibangun ulang (rebuild) saat pool habis jika repeat aktif
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Song, PlayRecord } from "../lib/db";
import { createPlayEvent } from "../lib/parsePlayedAt";

export type ShuffleMode = "off" | "all" | "songs" | "songs_and_categories";
export type RepeatMode =
  | "single_stop" | "category_stop" | "all_stop"
  | "repeat_one"  | "repeat_category" | "repeat_all";

export interface QueueItem {
  song: Song;
  fromManual: boolean;
  uid: string;
}

let _uidCounter = 0;
function makeUid() { return `q${++_uidCounter}`; }

interface QueueSnapshot {
  manualQueue: Song[];
  playContext: Song[];
  contextIndex: number;
  unifiedQueue: QueueItem[];
  timestamp: number;
  description?: string;
}

const MAX_UNDO_HISTORY = 20;
/** Max upcoming tracks materialized in unified queue (avoids lag with large libraries). */
const MAX_UNIFIED_UPCOMING = 50;

interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
  shuffleMode: ShuffleMode;
  repeatMode: RepeatMode;
  playContext: Song[];
  contextIndex: number;
  contextName: string;
  manualQueue: Song[];
  history: PlayRecord[];
  _shufflePool: number[];

  unifiedQueue: QueueItem[];
  _queueHistory: QueueSnapshot[];
  isQueueShuffled: boolean;
  /** Persisted backup of upcoming tracks when unified queue cannot be rebuilt. */
  upcomingQueue: Song[];

  _rebuildUnified: () => void;
  _saveSnapshot: (description?: string) => void;

  setCurrentSong: (song: Song | null) => void;
  setIsPlaying: (v: boolean) => void;
  setProgress: (v: number) => void;
  setCurrentTime: (v: number) => void;
  setDuration: (v: number) => void;
  setVolume: (v: number) => void;
  setShuffleMode: (mode: ShuffleMode) => void;
  cycleShuffleMode: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  cycleRepeatMode: () => void;
  setPlayContext: (songs: Song[], startIndex: number, contextName?: string) => void;

  addToManualQueue: (song: Song) => void;
  playNextTrack: (song: Song) => void;
  removeFromManualQueue: (index: number) => void;
  clearManualQueue: () => void;
  reorderManualQueue: (fromIdx: number, toIdx: number) => void;

  reorderUnified: (fromIdx: number, toIdx: number) => void;
  removeFromUnified: (uid: string) => void;
  undoQueueAction: () => boolean;
  shuffleQueueOnly: () => void;

  nextTrack: () => { song: Song; fromManual: boolean } | null;
  prevTrack: () => Song | null;
  getUpNext: (count?: number) => { song: Song; fromManual: boolean }[];
  addToHistory: (songId: number) => void;
  addPlayRecord: (record: PlayRecord) => void;

  queue: Song[];
  queueIndex: number;
  shuffle: boolean;
  repeat: string;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setQueue: (songs: Song[], startIndex?: number) => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (songId: number) => void;
  clearQueue: () => void;
}

function slimSong(s: Song): Song {
  return {
    id: s.id,
    path: s.path,
    title: s.title,
    artist: s.artist,
    album: s.album,
    genre: s.genre ?? "",
    year: s.year,
    duration: s.duration,
    bitrate: s.bitrate ?? 0,
    format: s.format,
    cover_art: null,
    bpm: s.bpm,
    file_size: s.file_size,
    loved: s.loved ?? 0,
    date_added: s.date_added ?? "",
    stars: s.stars,
    has_cover: s.has_cover,
    play_count: s.play_count ?? 0,
  };
}

function shuffleIndices(count: number, excludeFirst?: number): number[] {
  const arr = Array.from({ length: count }, (_, i) => i);
  if (excludeFirst !== undefined) {
    const idx = arr.indexOf(excludeFirst);
    if (idx > -1) arr.splice(idx, 1);
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Align contextIndex with the song that is actually playing. */
function syncContextIndexToCurrentSong(
  playContext: Song[],
  contextIndex: number,
  currentSong: Song | null,
): number {
  if (!currentSong || playContext.length === 0) {
    return Math.max(0, Math.min(contextIndex, Math.max(0, playContext.length - 1)));
  }
  const idx = playContext.findIndex(s => s.id === currentSong.id);
  if (idx >= 0) return idx;
  return Math.max(0, Math.min(contextIndex, playContext.length - 1));
}

function buildUnified(
  manualQueue: Song[],
  playContext: Song[],
  contextIndex: number,
  shuffleMode: ShuffleMode,
  shufflePool: number[],
): QueueItem[] {
  const result: QueueItem[] = [];

  for (const song of manualQueue) {
    result.push({ song, fromManual: true, uid: makeUid() });
  }

  if (shuffleMode !== "off" && shufflePool.length > 0) {
    let added = 0;
    for (const idx of shufflePool) {
      if (added >= MAX_UNIFIED_UPCOMING) break;
      if (playContext[idx]) {
        result.push({ song: playContext[idx], fromManual: false, uid: makeUid() });
        added++;
      }
    }
  } else {
    let added = 0;
    for (let i = contextIndex + 1; i < playContext.length && added < MAX_UNIFIED_UPCOMING; i++) {
      result.push({ song: playContext[i], fromManual: false, uid: makeUid() });
      added++;
    }
  }

  return result;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentSong: null,
      isPlaying: false,
      progress: 0,
      currentTime: 0,
      duration: 0,
      volume: 80,
      shuffleMode: "off",
      repeatMode: "repeat_all",
      playContext: [],
      contextIndex: 0,
      contextName: "",
      manualQueue: [],
      history: [],
      _shufflePool: [],
      unifiedQueue: [],
      _queueHistory: [],
      isQueueShuffled: false,
      upcomingQueue: [],
      queue: [],
      queueIndex: 0,
      shuffle: false,
      repeat: "off",

      // ── Internal ────────────────────────────────────────────────────────

      _rebuildUnified: () => {
        const { manualQueue, playContext, contextIndex, shuffleMode, _shufflePool, currentSong } = get();
        const syncedIndex = syncContextIndexToCurrentSong(playContext, contextIndex, currentSong);
        if (syncedIndex !== contextIndex) {
          set({ contextIndex: syncedIndex, queueIndex: syncedIndex });
        }
        const idx = syncedIndex;
        const unified = buildUnified(manualQueue, playContext, idx, shuffleMode, _shufflePool);
        set({
          unifiedQueue: unified,
          upcomingQueue: unified.slice(0, 100).map(x => slimSong(x.song)),
        });
      },

      _saveSnapshot: (description) => {
        const { manualQueue, playContext, contextIndex, unifiedQueue, _queueHistory } = get();
        const snapshot: QueueSnapshot = {
          manualQueue: [...manualQueue],
          playContext: [...playContext],
          contextIndex,
          unifiedQueue: unifiedQueue.map(x => ({ ...x })),
          timestamp: Date.now(),
          description,
        };
        const next = [snapshot, ..._queueHistory].slice(0, MAX_UNDO_HISTORY);
        set({ _queueHistory: next });
      },

      // ── Setters dasar ──────────────────────────────────────────────────

      setCurrentSong: (song) => {
        const { playContext, contextIndex } = get();
        const idx = syncContextIndexToCurrentSong(playContext, contextIndex, song);
        set({ currentSong: song, contextIndex: idx, queueIndex: idx });
        get()._rebuildUnified();
      },
      setIsPlaying: (v) => set({ isPlaying: v }),
      setProgress: (v) => set({ progress: v }),
      setCurrentTime: (v) => set({ currentTime: v }),
      setDuration: (v) => set({ duration: v }),
      setVolume: (v) => set({ volume: v }),

      setShuffleMode: (mode) => {
        const { playContext, contextIndex } = get();
        let pool: number[] = [];
        if (mode !== "off" && playContext.length > 0) {
          pool = shuffleIndices(playContext.length, contextIndex);
        }
        set({ shuffleMode: mode, _shufflePool: pool, shuffle: mode !== "off" });
        get()._rebuildUnified();
      },

      cycleShuffleMode: () => {
        const modes: ShuffleMode[] = ["off", "all", "songs", "songs_and_categories"];
        const current = get().shuffleMode;
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        get().setShuffleMode(next);
      },

      setRepeatMode: (mode) => set({
        repeatMode: mode,
        repeat: mode === "repeat_one" ? "one" : mode === "repeat_all" ? "all" : "off",
      }),

      cycleRepeatMode: () => {
        const modes: RepeatMode[] = [
          "all_stop",
          "repeat_all",
          "repeat_one",
        ];
        const current = get().repeatMode;
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        get().setRepeatMode(next);
      },

      setPlayContext: (songs, startIndex, contextName = "") => {
        const safeList = Array.isArray(songs) ? songs : [];
        const idx = Math.max(0, Math.min(startIndex, safeList.length - 1));
        const currentSong = safeList[idx] ?? null;
        const { shuffleMode } = get();
        let pool: number[] = [];
        if (shuffleMode !== "off" && safeList.length > 0) {
          // Build pool excluding the song we're about to play (idx)
          pool = shuffleIndices(safeList.length, idx);
        }
        // Set all state atomically FIRST, then rebuild unified
        set({
          playContext: safeList,
          contextIndex: idx,
          contextName,
          currentSong,
          _shufflePool: pool,
          queue: safeList,
          queueIndex: idx,
          manualQueue: [],
          isQueueShuffled: false,
          _queueHistory: [],
        });
        // Defer rebuild for large lists to avoid UI freeze
        if (safeList.length > 200) {
          queueMicrotask(() => get()._rebuildUnified());
        } else {
          get()._rebuildUnified();
        }
      },

      // ── Manual queue ────────────────────────────────────────────────────

      addToManualQueue: (song) => {
        set((s) => ({ manualQueue: [...s.manualQueue, song] }));
        get()._rebuildUnified();
      },

      playNextTrack: (song) => {
        set((s) => ({ manualQueue: [song, ...s.manualQueue] }));
        get()._rebuildUnified();
      },

      removeFromManualQueue: (index) => {
        get()._saveSnapshot("hapus lagu dari queue");
        set((s) => {
          const next = [...s.manualQueue];
          next.splice(index, 1);
          return { manualQueue: next };
        });
        get()._rebuildUnified();
      },

      clearManualQueue: () => {
        get()._saveSnapshot("hapus semua queue");
        set({ manualQueue: [], isQueueShuffled: false });
        get()._rebuildUnified();
      },

      reorderManualQueue: (fromIdx, toIdx) => {
        get()._saveSnapshot("reorder queue");
        set((s) => {
          const next = [...s.manualQueue];
          const [moved] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, moved);
          return { manualQueue: next };
        });
        get()._rebuildUnified();
      },

      // ── Unified queue ────────────────────────────────────────────────────

      reorderUnified: (fromIdx, toIdx) => {
        const { unifiedQueue, contextIndex, playContext } = get();
        if (fromIdx === toIdx) return;
        if (fromIdx < 0 || fromIdx >= unifiedQueue.length) return;
        if (toIdx   < 0 || toIdx   >= unifiedQueue.length) return;

        get()._saveSnapshot("reorder queue");

        const next = [...unifiedQueue];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);

        const newManual: Song[]  = next.filter(x => x.fromManual).map(x => x.song);
        const newContext: Song[] = next.filter(x => !x.fromManual).map(x => x.song);

        const currentSlice = playContext.slice(0, contextIndex + 1);
        const mergedContext = [...currentSlice, ...newContext];

        set({
          unifiedQueue: next,
          manualQueue: newManual,
          playContext: mergedContext,
          queue: mergedContext,
        });
      },

      removeFromUnified: (uid) => {
        const { unifiedQueue, contextIndex, playContext } = get();
        const item = unifiedQueue.find(x => x.uid === uid);
        if (!item) return;

        get()._saveSnapshot("hapus lagu dari queue");

        const next = unifiedQueue.filter(x => x.uid !== uid);

        if (item.fromManual) {
          const newManual = next.filter(x => x.fromManual).map(x => x.song);
          set({ unifiedQueue: next, manualQueue: newManual });
        } else {
          const newContext: Song[] = next.filter(x => !x.fromManual).map(x => x.song);
          const currentSlice = playContext.slice(0, contextIndex + 1);
          const mergedContext = [...currentSlice, ...newContext];
          set({ unifiedQueue: next, playContext: mergedContext, queue: mergedContext });
        }
      },

      undoQueueAction: () => {
        const { _queueHistory } = get();
        if (_queueHistory.length === 0) return false;

        const [last, ...rest] = _queueHistory;
        set({
          manualQueue: last.manualQueue,
          playContext: last.playContext,
          contextIndex: last.contextIndex,
          unifiedQueue: last.unifiedQueue,
          queue: last.playContext,
          queueIndex: last.contextIndex,
          _queueHistory: rest,
          isQueueShuffled: false,
        });
        return true;
      },

      shuffleQueueOnly: () => {
        const { manualQueue } = get();
        if (manualQueue.length === 0) return;

        get()._saveSnapshot("shuffle queue");

        const arr = [...manualQueue];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }

        set({ manualQueue: arr, isQueueShuffled: true });
        get()._rebuildUnified();
      },

      // ── nextTrack — FIXED shuffle pool consumption ──────────────────────
      nextTrack: () => {
        const { unifiedQueue, playContext, contextIndex, repeatMode, currentSong, shuffleMode, _shufflePool } = get();

        // Repeat one → same song
        if (repeatMode === "repeat_one") {
          return currentSong ? { song: currentSong, fromManual: false } : null;
        }

        // If unified queue has items, consume from it
        if (unifiedQueue.length > 0) {
          const next = unifiedQueue[0];
          const remainingUnified = unifiedQueue.slice(1);

          if (next.fromManual) {
            const { repeatMode, manualQueue } = get();
            let newManual: Song[];
            if (repeatMode === "repeat_all") {
              // Rotate manual queue so repeat-all loops added tracks
              const rest = manualQueue.filter(s => s.id !== next.song.id);
              newManual = rest.length > 0 ? [...rest, next.song] : manualQueue;
            } else {
              newManual = remainingUnified.filter(x => x.fromManual).map(x => x.song);
            }
            set({
              currentSong: next.song,
              manualQueue: newManual,
              unifiedQueue: remainingUnified,
            });
            get()._rebuildUnified();
          } else {
            // [FIX] Consume the first item from _shufflePool if shuffle is active
            let newPool = _shufflePool;
            let nextContextIndex = contextIndex;

            if (shuffleMode !== "off" && _shufflePool.length > 0) {
              // The next.song corresponds to _shufflePool[0] index in playContext
              newPool = _shufflePool.slice(1);
              // contextIndex should point to the song we just consumed
              const consumedIdx = _shufflePool[0];
              nextContextIndex = consumedIdx;
            } else {
              // Sequential: advance contextIndex
              nextContextIndex = contextIndex + 1 < playContext.length
                ? contextIndex + 1
                : contextIndex;
            }

            set({
              currentSong: next.song,
              contextIndex: nextContextIndex,
              queueIndex: nextContextIndex,
              _shufflePool: newPool,
              unifiedQueue: remainingUnified,
            });
            // Rebuild with updated contextIndex and pool
            get()._rebuildUnified();
          }

          return { song: next.song, fromManual: next.fromManual };
        }

        // No items in unifiedQueue — handle repeat/shuffle fallback

        const { manualQueue } = get();

        // Repeat-all with manual queue only (or after context exhausted)
        if (repeatMode === "repeat_all" && manualQueue.length > 0) {
          const nextSong = manualQueue[0];
          const rest = manualQueue.slice(1);
          set({
            currentSong: nextSong,
            manualQueue: [...rest, nextSong],
          });
          get()._rebuildUnified();
          return { song: nextSong, fromManual: true };
        }

        // Shuffle mode: try to rebuild pool from playContext
        if (shuffleMode !== "off") {
          const isRepeat = repeatMode === "repeat_all" || repeatMode === "repeat_category";
          if (isRepeat && playContext.length > 0) {
            // Rebuild pool excluding current song
            const newPool = shuffleIndices(playContext.length, contextIndex);
            if (newPool.length > 0) {
              const nextIdx = newPool[0];
              const nextSong = playContext[nextIdx];
              if (nextSong) {
                set({
                  currentSong: nextSong,
                  contextIndex: nextIdx,
                  queueIndex: nextIdx,
                  _shufflePool: newPool.slice(1),
                });
                get()._rebuildUnified();
                return { song: nextSong, fromManual: false };
              }
            }
          }
          return null;
        }

        // Sequential repeat modes
        if (repeatMode === "repeat_category" || repeatMode === "repeat_all") {
          if (playContext.length === 0) return null;
          const nextIdx = contextIndex + 1 < playContext.length ? contextIndex + 1 : 0;
          const nextSong = playContext[nextIdx];
          set({ contextIndex: nextIdx, currentSong: nextSong, queueIndex: nextIdx });
          get()._rebuildUnified();
          return { song: nextSong, fromManual: false };
        }

        // repeat off, try next sequential
        const nextIdx = contextIndex + 1;
        if (nextIdx < playContext.length) {
          const nextSong = playContext[nextIdx];
          set({ contextIndex: nextIdx, currentSong: nextSong, queueIndex: nextIdx });
          get()._rebuildUnified();
          return { song: nextSong, fromManual: false };
        }

        return null;
      },

      prevTrack: () => {
        const { playContext, contextIndex } = get();
        if (playContext.length === 0) return null;
        const prevIdx = Math.max(0, contextIndex - 1);
        const prevSong = playContext[prevIdx];
        set({ contextIndex: prevIdx, currentSong: prevSong, queueIndex: prevIdx });
        get()._rebuildUnified();
        return prevSong;
      },

      getUpNext: (count = 5) => {
        const { unifiedQueue } = get();
        return unifiedQueue.slice(0, count).map(x => ({ song: x.song, fromManual: x.fromManual }));
      },

      addToHistory: (songId) => {
        const event = createPlayEvent();
        const record: PlayRecord = { song_id: songId, ...event };
        set((s) => ({ history: [record, ...s.history].slice(0, 500) }));
      },

      addPlayRecord: (record) => {
        set((s) => ({ history: [record, ...s.history].slice(0, 500) }));
      },

      // ── Legacy compat ──────────────────────────────────────────────────────
      toggleShuffle: () => get().cycleShuffleMode(),
      cycleRepeat:   () => get().cycleRepeatMode(),
      setQueue:      (songs, startIndex = 0) => get().setPlayContext(songs, startIndex),
      addToQueue:    (song) => get().addToManualQueue(song),
      removeFromQueue: (songId) => {
        const { unifiedQueue } = get();
        const item = unifiedQueue.find(x => x.song.id === songId);
        if (item) get().removeFromUnified(item.uid);
      },
      clearQueue: () => get().clearManualQueue(),
    }),
    {
      name: "sonarix-player-v1",
      partialize: (s) => ({
        volume: s.volume,
        shuffleMode: s.shuffleMode,
        repeatMode: s.repeatMode,
        contextName: s.contextName,
        isQueueShuffled: s.isQueueShuffled,
        isPlaying: false,
        currentSong: s.currentSong ? slimSong(s.currentSong) : null,
        manualQueue: s.manualQueue.slice(0, 50).map(slimSong),
        playContext: s.playContext.slice(0, 500).map(slimSong),
        contextIndex: s.contextIndex,
        _shufflePool: s._shufflePool.slice(0, 500),
        upcomingQueue: (s.unifiedQueue?.length
          ? s.unifiedQueue.map(x => slimSong(x.song))
          : (s.upcomingQueue ?? []).map(slimSong)
        ).slice(0, 100),
      }),
      // Rebuild unifiedQueue + queue after rehydration from localStorage
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.isPlaying = false;
        const safeCtx    = Array.isArray(state.playContext)    ? state.playContext    : [];
        const safePool   = Array.isArray(state._shufflePool)   ? state._shufflePool   : [];
        const safeManual = Array.isArray(state.manualQueue)    ? state.manualQueue    : [];
        const safeUpcoming = Array.isArray(state.upcomingQueue) ? state.upcomingQueue : [];
        const syncedIdx  = syncContextIndexToCurrentSong(
          safeCtx, state.contextIndex ?? 0, state.currentSong ?? null,
        );
        state.contextIndex = syncedIdx;
        state.queueIndex   = syncedIdx;
        let unified = buildUnified(
          safeManual, safeCtx, syncedIdx, state.shuffleMode ?? "off", safePool,
        );
        // Restore from backup if rebuild produced empty queue but we had upcoming tracks
        if (unified.length === 0 && safeUpcoming.length > 0) {
          const currentId = state.currentSong?.id;
          const restoredManual = safeUpcoming.filter(s => s.id !== currentId);
          if (restoredManual.length > 0) {
            state.manualQueue = restoredManual;
            unified = buildUnified(
              restoredManual, safeCtx, syncedIdx, state.shuffleMode ?? "off", safePool,
            );
          }
        }
        state.unifiedQueue = unified;
        state.queue        = safeCtx;
      },
      storage: {
        getItem: (name: string) => {
          try {
            const v = localStorage.getItem(name);
            return v ? JSON.parse(v) : null;
          } catch {
            return null;
          }
        },
        setItem: (name: string, value: unknown) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            try {
              const minimal = {
                state: {
                  volume: (value as any)?.state?.volume ?? 80,
                  shuffleMode: (value as any)?.state?.shuffleMode ?? "off",
                  repeatMode: (value as any)?.state?.repeatMode ?? "repeat_all",
                  currentSong: (value as any)?.state?.currentSong ?? null,
                  contextName: (value as any)?.state?.contextName ?? "",
                  isQueueShuffled: (value as any)?.state?.isQueueShuffled ?? false,
                  manualQueue: (value as any)?.state?.manualQueue ?? [],
                  upcomingQueue: (value as any)?.state?.upcomingQueue ?? [],
                  playContext:   (value as any)?.state?.playContext   ?? [],
                  contextIndex:  (value as any)?.state?.contextIndex  ?? 0,
                  _shufflePool:  (value as any)?.state?._shufflePool  ?? [],
                },
                version: (value as any)?.version,
              };
              localStorage.setItem(name, JSON.stringify(minimal));
            } catch {
              console.warn("[Store] localStorage quota exceeded, state not persisted");
            }
          }
        },
        removeItem: (name: string) => {
          try { localStorage.removeItem(name); } catch { /* ignore */ }
        },
      },
    }
  )
);

/** Wait until Zustand persist has rehydrated player state from localStorage. */
export function waitForPlayerHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (usePlayerStore.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = usePlayerStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

/** Merge full library metadata into persisted slim queue/current song. */
export function enrichFromLibrary(library: Song[]): void {
  const byId = new Map(library.map(s => [s.id, s]));
  const resolve = (s: Song) => byId.get(s.id) ?? s;
  const state = usePlayerStore.getState();
  usePlayerStore.setState({
    currentSong: state.currentSong ? resolve(state.currentSong) : null,
    playContext: state.playContext.map(resolve),
    manualQueue: state.manualQueue.map(resolve),
    queue: state.playContext.map(resolve),
  });
  usePlayerStore.getState()._rebuildUnified();
}

/** Drop songs removed from library; fix indices after restart. */
export function prunePlayerContext(library: Song[]): void {
  const ids = new Set(library.map(s => s.id));
  const state = usePlayerStore.getState();
  const keep = (s: Song) => ids.has(s.id);

  const playContext = state.playContext.filter(keep);
  const manualQueue = state.manualQueue.filter(keep);
  const upcomingQueue = (state.upcomingQueue ?? []).filter(keep);

  let currentSong = state.currentSong && keep(state.currentSong)
    ? (library.find(s => s.id === state.currentSong!.id) ?? state.currentSong)
    : null;

  let contextIndex = syncContextIndexToCurrentSong(
    playContext, state.contextIndex, currentSong,
  );

  if (!currentSong && playContext.length > 0) {
    currentSong = playContext[contextIndex] ?? playContext[0] ?? null;
    contextIndex = currentSong
      ? playContext.findIndex(s => s.id === currentSong!.id)
      : 0;
  }

  const shufflePool = state._shufflePool.filter(
    i => i >= 0 && i < playContext.length && i !== contextIndex
  );

  usePlayerStore.setState({
    playContext,
    manualQueue,
    upcomingQueue,
    contextIndex,
    currentSong,
    _shufflePool: shufflePool,
    queue: playContext,
    queueIndex: contextIndex,
    isPlaying: false,
  });
  usePlayerStore.getState()._rebuildUnified();

  // If queue still empty after rebuild, restore from persisted backup
  const after = usePlayerStore.getState();
  if (after.unifiedQueue.length === 0 && upcomingQueue.length > 0) {
    const currentId = after.currentSong?.id;
    const restored = upcomingQueue
      .map(s => library.find(l => l.id === s.id) ?? s)
      .filter(s => s.id !== currentId);
    if (restored.length > 0) {
      usePlayerStore.setState({ manualQueue: restored });
      usePlayerStore.getState()._rebuildUnified();
    }
  }
}

// ── Library Store ─────────────────────────────────────────────────────────────

interface LibraryState {
  songs: Song[];
  playlists: { id: number; name: string; count: number; created_at: string }[];
  isLoading: boolean;
  scanProgress: {
    total: number; current: number; currentFile: string;
    currentFolder?: string; done: boolean;
    phase?: "scanning" | "indexing" | "completed";
  } | null;

  setSongs: (songs: Song[] | ((prev: Song[]) => Song[])) => void;
  updateSongRating: (songId: number, stars: number) => void;
  setPlaylists: (p: LibraryState["playlists"]) => void;
  setLoading: (v: boolean) => void;
  setScanProgress: (p: LibraryState["scanProgress"]) => void;
  addSongs: (songs: Song[]) => void;
  newBadgeTick: number;
  refreshNewBadges: () => void;
}

export const useLibraryStore = create<LibraryState>()((set) => ({
  songs: [], playlists: [], isLoading: false, scanProgress: null,

  setSongs: (songs) => set((s) => ({
    songs: typeof songs === "function"
      ? (() => {
          const r = (songs as (p: Song[]) => Song[])(s.songs);
          return Array.isArray(r) ? r : s.songs;
        })()
      : (Array.isArray(songs) ? songs : s.songs),
  })),
  updateSongRating: (songId, stars) => set((s) => ({
    songs: s.songs.map((song) => song.id === songId ? { ...song, stars } : song),
  })),
  setPlaylists: (p) => set({ playlists: Array.isArray(p) ? p : [] }),
  setLoading:   (v) => set({ isLoading: v }),
  setScanProgress: (p) => set({ scanProgress: p }),
  addSongs: (newSongs) => set((s) => {
    const map = new Map(s.songs.map((s) => [s.path, s]));
    newSongs.forEach((ns) => map.set(ns.path, { ...map.get(ns.path), ...ns }));
    return { songs: Array.from(map.values()) };
  }),
  newBadgeTick: 0,
  refreshNewBadges: () => set(s => ({ newBadgeTick: s.newBadgeTick + 1 })),
}));

// ── Settings Store ────────────────────────────────────────────────────────────

interface SettingsState {
  theme: "dark" | "darker" | "amoled";
  accentColor: string;
  eqGains: number[];
  eqPreset: string;
  visualizerType: "bar" | "wave" | "circle";
  showLyrics: boolean;
  sleepTimer: number | null;
  watchFolders: string[];
  crossfadeSec: number;
  replayGainEnabled: boolean;
  defaultVolume: number;
  gaplessEnabled: boolean;
  autoScanOnStart: boolean;
  compactMode: boolean;
  animationSpeed: "normal" | "slow" | "off";
  doubleClickAction: "play" | "queue" | "play_next";
  playCountThreshold: number;
  autoFetchLyrics: boolean;
  lyricsSource: "lrclib" | "lyrics_ovh";
  replayGainMode: "track" | "album" | "auto";
  fadeInOnResume: boolean;
  fadeInDuration: number;
  queueEndBehavior: "stop" | "loop" | "radio";
  /** When repeat is off and queue exhausted, play random from library without adding to queue */
  autoMixOnQueueEnd: boolean;
  outputDeviceId: string;
  monoDownmix: boolean;
  fontSizeScale: number;
  coverArtStyle: "square" | "rounded" | "circle";
  ambientBlurIntensity: number;
  customBackground: string | null;
  queuePanelPosition: "right" | "bottom";
  notificationsEnabled: boolean;
  excludeFolders: string[];

  // ── v1.2 extended settings ──
  defaultShuffleOnStart: boolean;
  defaultRepeatOnStart: "off" | "all" | "one";
  skipSilence: boolean;
  defaultPlaybackSpeed: number;
  scrobbleThresholdSec: number;
  preloadDepth: number;
  resumeBehavior: "auto_play" | "paused";
  radioSource: "library" | "same_genre" | "same_artist" | "smart" | "smart_mood";
  radioSmartEnabled: boolean;
  scanFollowSymlinks: boolean;
  autoUnblockFiles: boolean;
  duplicateHandling: "skip" | "mark" | "allow";
  excludeExtensions: string[];
  metadataLangPriority: "auto" | "en" | "ja" | "id";
  waveformDefaultStyle: "bars" | "mirror" | "line" | "progress";
  playerBarCompact: boolean;
  dynamicThemeFromCover: boolean;
  hiddenTabs: string[];
  lyricsFontSize: number;
  lyricsOffsetMs: number;
  lyricsOfflineCache: boolean;
  globalMediaKeys: boolean;
  closeToTray: boolean;
  startWithWindows: boolean;
  maximizeOnStartup: boolean;
  notificationShowCover: boolean;
  lastfmEnabled: boolean;
  lastfmApiKey: string;
  lastfmApiSecret: string;
  lastfmSessionKey: string;
  lastfmUsername: string;
  eqPresetPerMood: boolean;
  autoPlaylistEnabled: boolean;
  customKeybinds: Partial<Record<"fullscreen" | "commandPalette" | "toggleQueue", string>>;

  lastPlaylistId: number | null;

  setTheme: (t: SettingsState["theme"]) => void;
  setAccentColor: (c: string) => void;
  setEqGains: (g: number[]) => void;
  setEqPreset: (p: string) => void;
  setVisualizerType: (t: SettingsState["visualizerType"]) => void;
  toggleLyrics: () => void;
  setSleepTimer: (min: number | null) => void;
  addWatchFolder: (path: string) => void;
  removeWatchFolder: (path: string) => void;
  setCrossfadeSec: (sec: number) => void;
  setReplayGainEnabled: (v: boolean) => void;
  setDefaultVolume: (v: number) => void;
  setGaplessEnabled: (v: boolean) => void;
  setAutoScanOnStart: (v: boolean) => void;
  setCompactMode: (v: boolean) => void;
  setAnimationSpeed: (v: SettingsState["animationSpeed"]) => void;
  setDoubleClickAction: (v: SettingsState["doubleClickAction"]) => void;
  setAutoFetchLyrics: (v: boolean) => void;
  setLyricsSource: (v: SettingsState["lyricsSource"]) => void;
  setReplayGainMode: (v: SettingsState["replayGainMode"]) => void;
  setFadeInOnResume: (v: boolean) => void;
  setFadeInDuration: (v: number) => void;
  setQueueEndBehavior: (v: SettingsState["queueEndBehavior"]) => void;
  setAutoMixOnQueueEnd: (v: boolean) => void;
  setOutputDeviceId: (v: string) => void;
  setMonoDownmix: (v: boolean) => void;
  setFontSizeScale: (v: number) => void;
  setCoverArtStyle: (v: SettingsState["coverArtStyle"]) => void;
  setAmbientBlurIntensity: (v: number) => void;
  setCustomBackground: (v: string | null) => void;
  setQueuePanelPosition: (v: SettingsState["queuePanelPosition"]) => void;
  setNotificationsEnabled: (v: boolean) => void;
  addExcludeFolder: (path: string) => void;
  removeExcludeFolder: (path: string) => void;
  setPlayCountThreshold: (v: number) => void;
  setLastPlaylistId: (id: number | null) => void;
  setDefaultShuffleOnStart: (v: boolean) => void;
  setDefaultRepeatOnStart: (v: SettingsState["defaultRepeatOnStart"]) => void;
  setSkipSilence: (v: boolean) => void;
  setDefaultPlaybackSpeed: (v: number) => void;
  setScrobbleThresholdSec: (v: number) => void;
  setPreloadDepth: (v: number) => void;
  setResumeBehavior: (v: SettingsState["resumeBehavior"]) => void;
  setRadioSource: (v: SettingsState["radioSource"]) => void;
  setRadioSmartEnabled: (v: boolean) => void;
  setScanFollowSymlinks: (v: boolean) => void;
  setAutoUnblockFiles: (v: boolean) => void;
  setDuplicateHandling: (v: SettingsState["duplicateHandling"]) => void;
  setExcludeExtensions: (v: string[]) => void;
  setMetadataLangPriority: (v: SettingsState["metadataLangPriority"]) => void;
  setWaveformDefaultStyle: (v: SettingsState["waveformDefaultStyle"]) => void;
  setPlayerBarCompact: (v: boolean) => void;
  setDynamicThemeFromCover: (v: boolean) => void;
  setHiddenTabs: (v: string[]) => void;
  toggleHiddenTab: (tabId: string) => void;
  setLyricsFontSize: (v: number) => void;
  setLyricsOffsetMs: (v: number) => void;
  setLyricsOfflineCache: (v: boolean) => void;
  setGlobalMediaKeys: (v: boolean) => void;
  setCloseToTray: (v: boolean) => void;
  setStartWithWindows: (v: boolean) => void;
  setMaximizeOnStartup: (v: boolean) => void;
  setNotificationShowCover: (v: boolean) => void;
  setLastfmEnabled: (v: boolean) => void;
  setLastfmApiKey: (v: string) => void;
  setLastfmApiSecret: (v: string) => void;
  setLastfmSessionKey: (v: string) => void;
  setLastfmUsername: (v: string) => void;
  setEqPresetPerMood: (v: boolean) => void;
  setAutoPlaylistEnabled: (v: boolean) => void;
  setCustomKeybind: (action: keyof SettingsState["customKeybinds"], shortcut: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark", accentColor: "#7C3AED", eqGains: new Array(10).fill(0),
      eqPreset: "Flat", visualizerType: "bar", showLyrics: true,
      sleepTimer: null, watchFolders: [], crossfadeSec: 0,
      replayGainEnabled: true, defaultVolume: 80, gaplessEnabled: true,
      autoScanOnStart: false, compactMode: false, animationSpeed: "normal",
      doubleClickAction: "play", playCountThreshold: 50, autoFetchLyrics: true, lyricsSource: "lrclib",
      replayGainMode: "track",
      fadeInOnResume: false,
      fadeInDuration: 0.5,
      queueEndBehavior: "stop",
      autoMixOnQueueEnd: true,
      outputDeviceId: "",
      monoDownmix: false,
      fontSizeScale: 1.0,
      coverArtStyle: "rounded",
      ambientBlurIntensity: 40,
      customBackground: null,
      queuePanelPosition: "right",
      notificationsEnabled: true,
      excludeFolders: [],
      defaultShuffleOnStart: false,
      defaultRepeatOnStart: "off",
      skipSilence: false,
      defaultPlaybackSpeed: 1,
      scrobbleThresholdSec: 30,
      preloadDepth: 3,
      resumeBehavior: "paused",
      radioSource: "smart_mood",
      radioSmartEnabled: true,
      scanFollowSymlinks: false,
      autoUnblockFiles: true,
      duplicateHandling: "mark",
      excludeExtensions: [],
      metadataLangPriority: "auto",
      waveformDefaultStyle: "bars",
      playerBarCompact: false,
      dynamicThemeFromCover: false,
      hiddenTabs: [],
      lyricsFontSize: 14,
      lyricsOffsetMs: 0,
      lyricsOfflineCache: true,
      globalMediaKeys: true,
      closeToTray: false,
      startWithWindows: false,
      maximizeOnStartup: true,
      notificationShowCover: true,
      lastfmEnabled: false,
      lastfmApiKey: "",
      lastfmApiSecret: "",
      lastfmSessionKey: "",
      lastfmUsername: "",
      eqPresetPerMood: false,
      autoPlaylistEnabled: true,
      customKeybinds: {},
      lastPlaylistId: null,

      setTheme:            (t) => set({ theme: t }),
      setAccentColor:      (c) => set({ accentColor: c }),
      setEqGains:          (g) => set({ eqGains: g }),
      setEqPreset:         (p) => set({ eqPreset: p }),
      setVisualizerType:   (t) => set({ visualizerType: t }),
      toggleLyrics:        ()  => set((s) => ({ showLyrics: !s.showLyrics })),
      setSleepTimer:       (m) => set({ sleepTimer: m }),
      setCrossfadeSec:     (s) => set({ crossfadeSec: Math.max(0, Math.min(10, s)) }),
      setReplayGainEnabled:(v) => set({ replayGainEnabled: v }),
      setDefaultVolume:    (v) => set({ defaultVolume: Math.max(0, Math.min(100, v)) }),
      setGaplessEnabled:   (v) => set({ gaplessEnabled: v }),
      setAutoScanOnStart:  (v) => set({ autoScanOnStart: v }),
      setCompactMode:      (v) => set({ compactMode: v }),
      setAnimationSpeed:   (v) => set({ animationSpeed: v }),
      setDoubleClickAction:(v) => set({ doubleClickAction: v }),
      setPlayCountThreshold: (v) => set({ playCountThreshold: Math.max(0, Math.min(100, v)) }),
      setAutoFetchLyrics:  (v) => set({ autoFetchLyrics: v }),
      setLyricsSource:     (v) => set({ lyricsSource: v }),
      addWatchFolder: (path) => set((s) => ({
        watchFolders: s.watchFolders.includes(path)
          ? s.watchFolders
          : [...s.watchFolders, path],
      })),
      removeWatchFolder: (path) => set((s) => ({
        watchFolders: s.watchFolders.filter((f) => f !== path),
      })),
      setReplayGainMode:       (v) => set({ replayGainMode: v }),
      setFadeInOnResume:       (v) => set({ fadeInOnResume: v }),
      setFadeInDuration:       (v) => set({ fadeInDuration: Math.max(0.1, Math.min(3.0, v)) }),
      setQueueEndBehavior:     (v) => set({ queueEndBehavior: v }),
      setAutoMixOnQueueEnd:    (v) => set({ autoMixOnQueueEnd: v }),
      setOutputDeviceId:       (v) => set({ outputDeviceId: v }),
      setMonoDownmix:          (v) => set({ monoDownmix: v }),
      setFontSizeScale:        (v) => set({ fontSizeScale: Math.max(0.8, Math.min(1.4, v)) }),
      setCoverArtStyle:        (v) => set({ coverArtStyle: v }),
      setAmbientBlurIntensity: (v) => set({ ambientBlurIntensity: Math.max(0, Math.min(100, v)) }),
      setCustomBackground:     (v) => set({ customBackground: v }),
      setQueuePanelPosition:   (v) => set({ queuePanelPosition: v }),
      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      addExcludeFolder: (path) => set((s) => ({
        excludeFolders: s.excludeFolders.includes(path)
          ? s.excludeFolders
          : [...s.excludeFolders, path],
      })),
      removeExcludeFolder: (path) => set((s) => ({
        excludeFolders: s.excludeFolders.filter((f) => f !== path),
      })),
      setLastPlaylistId: (id) => set({ lastPlaylistId: id }),
      setDefaultShuffleOnStart: (v) => set({ defaultShuffleOnStart: v }),
      setDefaultRepeatOnStart: (v) => set({ defaultRepeatOnStart: v }),
      setSkipSilence: (v) => set({ skipSilence: v }),
      setDefaultPlaybackSpeed: (v) => set({ defaultPlaybackSpeed: Math.max(0.5, Math.min(2, v)) }),
      setScrobbleThresholdSec: (v) => set({ scrobbleThresholdSec: Math.max(10, Math.min(240, v)) }),
      setPreloadDepth: (v) => set({ preloadDepth: Math.max(0, Math.min(10, v)) }),
      setResumeBehavior: (v) => set({ resumeBehavior: v }),
      setRadioSource: (v) => set({ radioSource: v }),
      setRadioSmartEnabled: (v) => set({ radioSmartEnabled: v }),
      setScanFollowSymlinks: (v) => set({ scanFollowSymlinks: v }),
      setAutoUnblockFiles: (v) => set({ autoUnblockFiles: v }),
      setDuplicateHandling: (v) => set({ duplicateHandling: v }),
      setExcludeExtensions: (v) => set({ excludeExtensions: v }),
      setMetadataLangPriority: (v) => set({ metadataLangPriority: v }),
      setWaveformDefaultStyle: (v) => set({ waveformDefaultStyle: v }),
      setPlayerBarCompact: (v) => set({ playerBarCompact: v }),
      setDynamicThemeFromCover: (v) => set({ dynamicThemeFromCover: v }),
      setHiddenTabs: (v) => set({ hiddenTabs: v }),
      toggleHiddenTab: (tabId) => set((s) => ({
        hiddenTabs: s.hiddenTabs.includes(tabId)
          ? s.hiddenTabs.filter(t => t !== tabId)
          : [...s.hiddenTabs, tabId],
      })),
      setLyricsFontSize: (v) => set({ lyricsFontSize: Math.max(10, Math.min(24, v)) }),
      setLyricsOffsetMs: (v) => set({ lyricsOffsetMs: Math.max(-5000, Math.min(5000, v)) }),
      setLyricsOfflineCache: (v) => set({ lyricsOfflineCache: v }),
      setGlobalMediaKeys: (v) => set({ globalMediaKeys: v }),
      setCloseToTray: (v) => set({ closeToTray: v }),
      setStartWithWindows: (v) => set({ startWithWindows: v }),
      setMaximizeOnStartup: (v) => set({ maximizeOnStartup: v }),
      setNotificationShowCover: (v) => set({ notificationShowCover: v }),
      setLastfmEnabled: (v) => set({ lastfmEnabled: v }),
      setLastfmApiKey: (v) => set({ lastfmApiKey: v }),
      setLastfmApiSecret: (v) => set({ lastfmApiSecret: v }),
      setLastfmSessionKey: (v) => set({ lastfmSessionKey: v }),
      setLastfmUsername: (v) => set({ lastfmUsername: v }),
      setEqPresetPerMood: (v) => set({ eqPresetPerMood: v }),
      setAutoPlaylistEnabled: (v) => set({ autoPlaylistEnabled: v }),
      setCustomKeybind: (action, shortcut) => set((s) => ({
        customKeybinds: { ...s.customKeybinds, [action]: shortcut },
      })),
    }),
    { name: "sonarix-settings" }
  )
);