/**
 * BookmarkPopover.tsx — List / jump / remove song bookmarks
 */

import { useState, useEffect } from "react";
import {
  getBookmarksForSong, removeBookmark, addBookmark, type SongBookmark,
} from "../../lib/bookmarks";
import { audioEngine } from "../../lib/audioEngine";
import { useLang } from "../../lib/i18n";

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props {
  songId: number;
  currentTime: number;
  onClose: () => void;
}

export default function BookmarkPopover({ songId, currentTime, onClose }: Props) {
  const { t } = useLang();
  const [list, setList] = useState<SongBookmark[]>([]);

  const reload = () => setList(getBookmarksForSong(songId));

  useEffect(() => { reload(); }, [songId]);

  return (
    <div
      style={{
        position: "absolute", bottom: "100%", left: 0, marginBottom: 8,
        minWidth: 200, maxWidth: 280, maxHeight: 220, overflowY: "auto",
        background: "var(--bg-overlay)", border: "1px solid var(--border-medium)",
        borderRadius: "var(--radius-md)", padding: 6,
        boxShadow: "0 12px 32px rgba(0,0,0,0.5)", zIndex: 100,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 8px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>{t.bookmarksTitle}</span>
        <button
          type="button"
          onClick={() => {
            void addBookmark(songId, currentTime).then(reload);
          }}
          style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 6,
            border: "1px solid var(--accent-border)", background: "var(--accent-dim)",
            color: "var(--accent-light)", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + {fmt(currentTime)}
        </button>
      </div>

      {list.length === 0 ? (
        <p style={{ fontSize: 11, color: "var(--text-faint)", padding: "8px 6px", margin: 0 }}>{t.noBookmarks}</p>
      ) : (
        list.map(bm => (
          <div
            key={`${bm.songId}-${bm.time}`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 8px", borderRadius: 6, cursor: "pointer",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-muted)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <button
              type="button"
              onClick={() => { audioEngine.seek(bm.time); onClose(); }}
              style={{
                flex: 1, textAlign: "left", background: "none", border: "none",
                cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 11,
                color: "var(--accent-light)",
              }}
            >
              {fmt(bm.time)}
            </button>
            <span style={{ flex: 2, fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {bm.label}
            </span>
            <button
              type="button"
              onClick={() => { void removeBookmark(bm.songId, bm.time).then(reload); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 12 }}
              title={t.removeBookmark}
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  );
}
