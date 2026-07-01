/**
 * ExtendedSettingsSections.tsx — v1.2 additional settings UI
 */

import { useState, useMemo } from "react";
import { useSettingsStore, useLibraryStore, usePlayerStore } from "../../store";
import { findDuplicates } from "../../lib/duplicateDetection";
import { backupLibraryDb, restoreLibraryDb, exportListeningHistory, exportListeningHistoryCsv } from "../../lib/backupRestore";
import { toastSuccess, toastError, toastInfo } from "../Notification/ToastSystem";

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "8px 0" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: "var(--accent)" }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div>}
      </div>
    </label>
  );
}

function SelectRow({ label, value, options, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: "100%", padding: "8px 10px", borderRadius: 8, fontSize: 13,
        background: "var(--bg-overlay)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit",
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function NumberRow({ label, value, min, max, step, onChange, suffix }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="range" min={min} max={max} step={step ?? 1} value={value}
          onChange={e => onChange(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--accent)" }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 48, fontFamily: "monospace" }}>{value}{suffix ?? ""}</span>
      </div>
    </label>
  );
}

export function ExtendedPlaybackSettings({ lang }: { lang: "id" | "en" }) {
  const s = useSettingsStore() as any;
  return (
    <div>
      <SelectRow label={lang === "id" ? "Sumber Radio" : "Radio source"} value={s.radioSource ?? "smart_mood"} onChange={s.setRadioSource}
        options={[
          { value: "smart_mood", label: "Smart Mood" },
          { value: "smart", label: "Smart shuffle" },
          { value: "library", label: lang === "id" ? "Seluruh library" : "Full library" },
          { value: "same_genre", label: lang === "id" ? "Genre sama" : "Same genre" },
          { value: "same_artist", label: lang === "id" ? "Artis sama" : "Same artist" },
        ]}
      />
      <Toggle checked={!!s.radioSmartEnabled} onChange={s.setRadioSmartEnabled}
        label="Smart Radio" desc={lang === "id" ? "Acak berdasarkan mood & history, bukan random murni" : "Shuffle by mood & history"} />
      <SelectRow label={lang === "id" ? "Resume saat buka app" : "Resume on startup"} value={s.resumeBehavior ?? "paused"} onChange={s.setResumeBehavior}
        options={[
          { value: "paused", label: lang === "id" ? "Pause (posisi tersimpan)" : "Paused (position saved)" },
          { value: "auto_play", label: lang === "id" ? "Auto-play lanjut" : "Auto-play resume" },
        ]}
      />
      <NumberRow label={lang === "id" ? "Kecepatan default" : "Default speed"} value={s.defaultPlaybackSpeed ?? 1} min={0.5} max={2} step={0.1}
        onChange={s.setDefaultPlaybackSpeed} suffix="×" />
      <NumberRow label={lang === "id" ? "Scrobble threshold" : "Scrobble threshold"} value={s.scrobbleThresholdSec ?? 30} min={10} max={120} step={5}
        onChange={s.setScrobbleThresholdSec} suffix="s" />
      <NumberRow label={lang === "id" ? "Preload depth" : "Preload depth"} value={s.preloadDepth ?? 3} min={0} max={10}
        onChange={s.setPreloadDepth} />
      <Toggle checked={!!s.skipSilence} onChange={s.setSkipSilence} label="Skip silence" desc={lang === "id" ? "Lewati intro/outro sunyi (experimental)" : "Skip silent intro/outro (experimental)"} />
      <Toggle checked={!!s.eqPresetPerMood} onChange={s.setEqPresetPerMood}
        label={lang === "id" ? "EQ preset per mood" : "EQ preset per mood"} desc={lang === "id" ? "Auto-apply EQ saat buka tab Cerdas" : "Auto EQ when opening Smart tab"} />
    </div>
  );
}

export function ExtendedLibrarySettings({ lang }: { lang: "id" | "en" }) {
  const s = useSettingsStore() as any;
  const { songs } = useLibraryStore();
  const [dupes, setDupes] = useState<ReturnType<typeof findDuplicates> | null>(null);

  const scanDupes = () => {
    const d = findDuplicates(songs);
    setDupes(d);
    toastInfo(`${d.length} grup duplikat ditemukan`);
  };

  return (
    <div>
      <SelectRow label={lang === "id" ? "Penanganan duplikat" : "Duplicate handling"} value={s.duplicateHandling ?? "mark"} onChange={s.setDuplicateHandling}
        options={[
          { value: "mark", label: lang === "id" ? "Tandai saja" : "Mark only" },
          { value: "skip", label: lang === "id" ? "Skip saat scan" : "Skip on scan" },
          { value: "allow", label: lang === "id" ? "Izinkan semua" : "Allow all" },
        ]}
      />
      <Toggle checked={!!s.scanFollowSymlinks} onChange={s.setScanFollowSymlinks} label="Follow symlinks" />
      <Toggle checked={!!s.autoUnblockFiles} onChange={s.setAutoUnblockFiles}
        label={lang === "id" ? "Auto-unblock file Windows" : "Auto-unblock Windows files"} />
      <button onClick={scanDupes} style={{
        marginTop: 8, padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
        background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--accent-light)", fontFamily: "inherit",
      }}>{lang === "id" ? "Scan duplikat" : "Scan duplicates"}</button>
      {dupes && dupes.length > 0 && (
        <div style={{ marginTop: 10, maxHeight: 160, overflowY: "auto", fontSize: 11, color: "var(--text-muted)" }}>
          {dupes.slice(0, 8).map(g => (
            <div key={g.key} style={{ padding: "4px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              {g.songs.length}× {g.songs[0]?.title} — {g.songs[0]?.artist}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExtendedAppearanceSettings({ lang }: { lang: "id" | "en" }) {
  const s = useSettingsStore() as any;
  const tabOptions = ["equalizer", "folders", "smart", "playlists"];
  return (
    <div>
      <SelectRow label={lang === "id" ? "Waveform default" : "Default waveform"} value={s.waveformDefaultStyle ?? "bars"} onChange={s.setWaveformDefaultStyle}
        options={[
          { value: "bars", label: "Bars" }, { value: "mirror", label: "Mirror" },
          { value: "line", label: "Line" }, { value: "progress", label: "Progress bar" },
        ]}
      />
      <Toggle checked={!!s.playerBarCompact} onChange={s.setPlayerBarCompact} label={lang === "id" ? "Player bar compact" : "Compact player bar"} />
      <Toggle checked={!!s.dynamicThemeFromCover} onChange={s.setDynamicThemeFromCover}
        label={lang === "id" ? "Tema dinamis dari cover" : "Dynamic theme from cover art"} />
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{lang === "id" ? "Sembunyikan tab:" : "Hide tabs:"}</p>
      {tabOptions.map(tab => (
        <Toggle key={tab} checked={(s.hiddenTabs ?? []).includes(tab)} onChange={() => s.toggleHiddenTab(tab)} label={tab} />
      ))}
    </div>
  );
}

export function ExtendedLyricsSettings({ lang }: { lang: "id" | "en" }) {
  const s = useSettingsStore() as any;
  return (
    <div>
      <NumberRow label={lang === "id" ? "Ukuran font lirik" : "Lyrics font size"} value={s.lyricsFontSize ?? 14} min={10} max={24} onChange={s.setLyricsFontSize} suffix="px" />
      <NumberRow label={lang === "id" ? "Offset lirik" : "Lyrics offset"} value={s.lyricsOffsetMs ?? 0} min={-3000} max={3000} step={100} onChange={s.setLyricsOffsetMs} suffix="ms" />
      <Toggle checked={!!s.lyricsOfflineCache} onChange={s.setLyricsOfflineCache} label={lang === "id" ? "Cache lirik offline" : "Offline lyrics cache"} />
    </div>
  );
}

export function ExtendedSystemSettings({ lang }: { lang: "id" | "en" }) {
  const s = useSettingsStore() as any;
  return (
    <div>
      <Toggle checked={!!s.globalMediaKeys} onChange={s.setGlobalMediaKeys} label="Global media keys" desc="Media Session API — play/pause saat app di belakang" />
      <Toggle checked={!!s.closeToTray} onChange={s.setCloseToTray} label={lang === "id" ? "Tutup ke tray" : "Close to tray"} desc={lang === "id" ? "Minimize saat tutup window (perlu restart)" : "Minimize on close (restart required)"} />
      <Toggle checked={!!s.startWithWindows} onChange={s.setStartWithWindows} label={lang === "id" ? "Mulai dengan Windows" : "Start with Windows"} />
      <Toggle checked={s.notificationShowCover !== false} onChange={s.setNotificationShowCover} label={lang === "id" ? "Tampilkan cover di notifikasi" : "Show cover in notifications"} />
    </div>
  );
}

export function ExtendedLastfmSettings({ lang }: { lang: "id" | "en" }) {
  const s = useSettingsStore() as any;
  return (
    <div>
      <Toggle checked={!!s.lastfmEnabled} onChange={s.setLastfmEnabled} label="Last.fm scrobbling" desc={lang === "id" ? "Off by default — butuh API key & session" : "Off by default — needs API key & session"} />
      <label style={{ display: "block", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>API Key</span>
        <input value={s.lastfmApiKey ?? ""} onChange={e => s.setLastfmApiKey(e.target.value)} style={{
          width: "100%", marginTop: 4, padding: "7px 9px", borderRadius: 8, fontSize: 12,
          background: "var(--bg-overlay)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit",
        }} />
      </label>
      <label style={{ display: "block", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>API Secret</span>
        <input value={s.lastfmApiSecret ?? ""} onChange={e => s.setLastfmApiSecret(e.target.value)} type="password" style={{
          width: "100%", marginTop: 4, padding: "7px 9px", borderRadius: 8, fontSize: 12,
          background: "var(--bg-overlay)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit",
        }} />
      </label>
      <label style={{ display: "block", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Session Key</span>
        <input value={s.lastfmSessionKey ?? ""} onChange={e => s.setLastfmSessionKey(e.target.value)} type="password" style={{
          width: "100%", marginTop: 4, padding: "7px 9px", borderRadius: 8, fontSize: 12,
          background: "var(--bg-overlay)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit",
        }} />
      </label>
      <p style={{ fontSize: 10, color: "var(--text-faint)", margin: "0 0 10px" }}>
        {lang === "id"
          ? "Secret diperlukan untuk api_sig scrobbling. Dapatkan dari halaman API Last.fm."
          : "Secret required for api_sig scrobbling. Get it from your Last.fm API account page."}
      </p>
    </div>
  );
}

export function ExtendedKeybindSettings({ lang }: { lang: "id" | "en" }) {
  const s = useSettingsStore() as any;
  const fields: { key: "fullscreen" | "commandPalette" | "toggleQueue"; label: string; placeholder: string }[] = [
    { key: "fullscreen", label: lang === "id" ? "Fullscreen now playing" : "Fullscreen now playing", placeholder: "Shift+KeyP" },
    { key: "commandPalette", label: lang === "id" ? "Command palette" : "Command palette", placeholder: "Ctrl+KeyK" },
    { key: "toggleQueue", label: lang === "id" ? "Toggle antrian" : "Toggle queue", placeholder: "Ctrl+KeyQ" },
  ];
  return (
    <div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
        {lang === "id"
          ? "Format: Ctrl+KeyK, Shift+KeyP, Alt+KeyX. Kosongkan untuk default."
          : "Format: Ctrl+KeyK, Shift+KeyP, Alt+KeyX. Leave empty for default."}
      </p>
      {fields.map(f => (
        <label key={f.key} style={{ display: "block", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{f.label}</span>
          <input
            value={s.customKeybinds?.[f.key] ?? ""}
            onChange={e => s.setCustomKeybind(f.key, e.target.value.trim())}
            placeholder={f.placeholder}
            style={{
              width: "100%", marginTop: 4, padding: "7px 9px", borderRadius: 8, fontSize: 12,
              background: "var(--bg-overlay)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit",
            }}
          />
        </label>
      ))}
    </div>
  );
}

export function ExtendedDataSettings({ lang }: { lang: "id" | "en" }) {
  const { songs } = useLibraryStore();
  const { history } = usePlayerStore();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button onClick={async () => {
        const ok = await backupLibraryDb();
        ok ? toastSuccess("Backup berhasil") : toastError("Backup gagal");
      }} style={btnStyle}>{lang === "id" ? "Backup library DB" : "Backup library DB"}</button>
      <button onClick={async () => {
        const ok = await restoreLibraryDb();
        ok ? toastSuccess("Restore berhasil — restart app") : toastError("Restore gagal");
      }} style={btnStyle}>{lang === "id" ? "Restore library DB" : "Restore library DB"}</button>
      <button onClick={async () => {
        const ok = await exportListeningHistory(history, songs);
        ok ? toastSuccess("History JSON exported") : toastInfo("Export dibatalkan");
      }} style={btnStyle}>{lang === "id" ? "Export history (JSON)" : "Export history (JSON)"}</button>
      <button onClick={async () => {
        const ok = await exportListeningHistoryCsv(history, songs);
        ok ? toastSuccess("History CSV exported") : toastInfo("Export dibatalkan");
      }} style={btnStyle}>{lang === "id" ? "Export history (CSV)" : "Export history (CSV)"}</button>
    </div>
  );
}

const btnStyle = {
  padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
  background: "var(--bg-overlay)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit", textAlign: "left" as const,
};
