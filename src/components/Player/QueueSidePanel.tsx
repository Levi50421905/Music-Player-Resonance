/**
 * QueueSidePanel.tsx — Slide-in queue panel (always accessible while playing)
 */

import { useEffect } from "react";
import QueueView from "../Playlist/QueueView";
import type { Song } from "../../lib/db";

interface Props {
  open: boolean;
  onClose: () => void;
  queueCount: number;
  position?: "right" | "bottom";
  onPlay: (song: Song) => void;
  onPlayFromQueue: (songs: Song[], startIndex: number, contextName: string) => void;
}

export default function QueueSidePanel({
  open, onClose, queueCount, position = "right", onPlay, onPlayFromQueue,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="queue-panel-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={`queue-side-panel ${position === "bottom" ? "queue-side-panel--bottom" : ""}`}
        role="dialog"
        aria-label="Queue"
      >
        <div className="queue-panel-header">
          <div>
            <h3 style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", margin: 0 }}>
              Antrian
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>
              {queueCount} lagu mendatang
            </p>
          </div>
          <button
            onClick={onClose}
            className="queue-panel-close"
            title="Tutup (Esc)"
          >✕</button>
        </div>
        <div className="queue-panel-body">
          <QueueView onPlay={onPlay} onPlayFromQueue={onPlayFromQueue} />
        </div>
      </aside>
    </>
  );
}
