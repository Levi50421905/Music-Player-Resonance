/**
 * useSkipSilence.ts — Skip silent intro/outro when enabled
 */

import { useEffect, useRef } from "react";
import { audioEngine } from "../lib/audioEngine";
import { useSettingsStore } from "../store";
import { usePlayerStore } from "../store";

const SILENCE_THRESHOLD = 0.008;
const CHUNK_SEC = 0.5;
const MAX_SKIP_SEC = 45;

export function useSkipSilence() {
  const skipSilence = useSettingsStore(s => s.skipSilence);
  const currentSong = usePlayerStore(s => s.currentSong);
  const ranForSongRef = useRef<number | null>(null);

  useEffect(() => {
    if (!skipSilence || !currentSong?.id) return;
    if (ranForSongRef.current === currentSong.id) return;

    let cancelled = false;
    const songId = currentSong.id;

    const trySkip = () => {
      if (cancelled || ranForSongRef.current === songId) return;
      const analyser = (audioEngine as any).analyser as AnalyserNode | undefined;
      const duration = audioEngine.duration;
      if (!analyser || !duration || duration < 1) return;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      let t = audioEngine.currentTime;
      let skipped = 0;

      const step = () => {
        if (cancelled || ranForSongRef.current === songId) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > SILENCE_THRESHOLD || t >= MAX_SKIP_SEC || t >= duration - 1) {
          ranForSongRef.current = songId;
          return;
        }
        t = Math.min(duration - 0.5, t + CHUNK_SEC);
        skipped += CHUNK_SEC;
        audioEngine.seek(t);
        if (skipped < MAX_SKIP_SEC) requestAnimationFrame(step);
        else ranForSongRef.current = songId;
      };

      requestAnimationFrame(step);
    };

    const id = window.setTimeout(trySkip, 600);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [skipSilence, currentSong?.id]);
}
