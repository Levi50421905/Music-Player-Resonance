/**
 * ListeningActivityChart — 7-day / weekly / hourly listening visualization
 * Bar chart with Y-axis grid, count labels, and trend line for clear comparison.
 */

import { useMemo, useState } from "react";
import type { Lang } from "../../lib/i18n";
import { getDayLabels } from "../../lib/i18n";

export interface Day7Entry {
  date: Date;
  label: string;
  count: number;
  songIds: Set<number>;
}

export interface DowEntry {
  count: number;
  intensity: number;
  label: string;
}

export interface HourEntry {
  hour: number;
  count: number;
  intensity: number;
}

type ChartMode = "7days" | "dow" | "hourly";

interface Props {
  lang: Lang;
  t: {
    chartLast7Days: string;
    chartByDow: string;
    chartByHour: string;
    chartMode7Days: string;
    chartModeWeekly: string;
    chartModeHourly: string;
    chartPlaysUnique: (plays: number, unique: number) => string;
    chartTimes: (n: number, day: string) => string;
    chartHourFormat: (hour: number) => string;
  };
  last7Days: Day7Entry[];
  dowData: DowEntry[];
  hourlyData: HourEntry[];
}

const CHART_H = 100;
const PAD_TOP = 18;
const PAD_BOTTOM = 4;

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export default function ListeningActivityChart({
  lang, t, last7Days, dowData, hourlyData,
}: Props) {
  const [mode, setMode] = useState<ChartMode>("7days");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const max7 = Math.max(...last7Days.map(d => d.count), 1);
  const maxDow = Math.max(...dowData.map(d => d.count), 1);
  const maxHour = Math.max(...hourlyData.map(h => h.count), 1);

  const yTicks = useMemo(() => {
    const max = mode === "7days" ? max7 : mode === "dow" ? maxDow : maxHour;
    if (max <= 1) return [0, 1];
    const mid = Math.ceil(max / 2);
    return [0, mid, max];
  }, [mode, max7, maxDow, maxHour]);

  const modeTitle =
    mode === "7days" ? t.chartLast7Days :
    mode === "dow" ? t.chartByDow :
    t.chartByHour;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{
          fontSize: 11, fontWeight: 700, color: "var(--text-faint)",
          textTransform: "uppercase", letterSpacing: "0.08em", margin: 0,
        }}>
          {modeTitle}
        </p>
        <div style={{ display: "flex", gap: 4 }}>
          {([
            ["7days", t.chartMode7Days],
            ["dow", t.chartModeWeekly],
            ["hourly", t.chartModeHourly],
          ] as [ChartMode, string][]).map(([val, lbl]) => (
            <button
              key={val}
              type="button"
              onClick={() => { setMode(val); setHoveredIdx(null); }}
              style={{
                padding: "3px 9px", borderRadius: "var(--radius-sm)", fontSize: 10,
                border: "1px solid",
                background: mode === val ? "var(--accent-dim)" : "transparent",
                borderColor: mode === val ? "var(--accent-border)" : "var(--border-medium)",
                color: mode === val ? "var(--accent-light)" : "var(--text-faint)",
                cursor: "pointer", fontFamily: "inherit",
                fontWeight: mode === val ? 700 : 400,
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        {/* Y-axis */}
        <div style={{
          width: 28, flexShrink: 0, position: "relative",
          height: CHART_H + PAD_TOP + PAD_BOTTOM + 22,
        }}>
          {yTicks.slice().reverse().map((tick, i) => (
            <span
              key={tick}
              style={{
                position: "absolute",
                right: 0,
                top: PAD_TOP + (i / Math.max(yTicks.length - 1, 1)) * CHART_H - 6,
                fontSize: 9,
                color: "var(--text-faint)",
                fontFamily: "'Space Mono', monospace",
                lineHeight: 1,
              }}
            >
              {tick}
            </span>
          ))}
        </div>

        {/* Chart area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <svg
            viewBox={`0 0 ${mode === "hourly" ? 480 : 340} ${CHART_H + PAD_TOP + PAD_BOTTOM}`}
            width="100%"
            height={CHART_H + PAD_TOP + PAD_BOTTOM}
            style={{ display: "block", overflow: "visible" }}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Grid lines */}
            {yTicks.map((tick, i) => {
              const y = PAD_TOP + CHART_H - (tick / yTicks[yTicks.length - 1]) * CHART_H;
              return (
                <line
                  key={`grid-${tick}`}
                  x1={0}
                  y1={y}
                  x2={mode === "hourly" ? 480 : 340}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? "0" : "4 4"}
                />
              );
            })}

            {mode === "7days" && (
              <SevenDayChart
                data={last7Days}
                max={max7}
                hoveredIdx={hoveredIdx}
                onHover={setHoveredIdx}
              />
            )}
            {mode === "dow" && (
              <BarChart
                count={7}
                values={dowData.map(d => d.count)}
                max={maxDow}
                hoveredIdx={hoveredIdx}
                onHover={setHoveredIdx}
                width={340}
              />
            )}
            {mode === "hourly" && (
              <BarChart
                count={24}
                values={hourlyData.map(h => h.count)}
                max={maxHour}
                hoveredIdx={hoveredIdx}
                onHover={setHoveredIdx}
                width={480}
                barGap={1}
              />
            )}
          </svg>

          {/* X-axis labels */}
          <div style={{
            display: "flex",
            gap: mode === "hourly" ? 2 : 6,
            marginTop: 6,
            paddingLeft: 0,
          }}>
            {mode === "7days" && last7Days.map((day, i) => (
              <div
                key={i}
                style={{
                  flex: 1, textAlign: "center", fontSize: 9,
                  color: i === 6 ? "var(--accent-light)" : "var(--text-faint)",
                  fontWeight: i === 6 ? 700 : 400,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >
                {day.label}
              </div>
            ))}
            {mode === "dow" && dowData.map((day, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--text-faint)" }}>
                {day.label}
              </div>
            ))}
            {mode === "hourly" && (
              <div style={{ position: "relative", width: "100%", height: 14 }}>
                {[0, 6, 12, 18].map(hr => (
                  <span
                    key={hr}
                    style={{
                      position: "absolute",
                      left: `${(hr / 24) * 100}%`,
                      transform: "translateX(-50%)",
                      fontSize: 9,
                      color: "var(--text-faint)",
                    }}
                  >
                    {formatHour(hr)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip strip */}
      {hoveredIdx !== null && (
        <div style={{
          marginTop: 10, padding: "8px 12px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-medium)",
          borderRadius: "var(--radius-md)",
          fontSize: 11,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          {mode === "7days" && last7Days[hoveredIdx] && (
            <>
              <span style={{ fontWeight: 700, color: "var(--accent-light)", fontFamily: "'Space Mono', monospace" }}>
                {last7Days[hoveredIdx].count}
              </span>
              <span style={{ color: "var(--text-secondary)" }}>
                {t.chartPlaysUnique(last7Days[hoveredIdx].count, last7Days[hoveredIdx].songIds.size)}
              </span>
              <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>
                {last7Days[hoveredIdx].label}
              </span>
            </>
          )}
          {mode === "dow" && dowData[hoveredIdx] && (
            <span style={{ color: "var(--text-secondary)" }}>
              {t.chartTimes(dowData[hoveredIdx].count, dowData[hoveredIdx].label)}
            </span>
          )}
          {mode === "hourly" && hourlyData[hoveredIdx] && (
            <span style={{ color: "var(--text-secondary)" }}>
              {hourlyData[hoveredIdx].count}× · {t.chartHourFormat(hourlyData[hoveredIdx].hour)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SevenDayChart({
  data, max, hoveredIdx, onHover,
}: {
  data: Day7Entry[];
  max: number;
  hoveredIdx: number | null;
  onHover: (i: number | null) => void;
}) {
  const w = 340;
  const n = data.length;
  const slotW = w / n;
  const barW = slotW * 0.55;

  const points = data.map((d, i) => {
    const x = slotW * i + slotW / 2;
    const h = max > 0 ? (d.count / max) * CHART_H : 0;
    const y = PAD_TOP + CHART_H - h;
    return { x, y, h, count: d.count };
  });

  const linePath = points
    .filter(p => p.count > 0)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <g>
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="var(--accent-light)"
          strokeWidth={1.5}
          strokeOpacity={0.45}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {points.map((p, i) => {
        const isToday = i === n - 1;
        const isHov = hoveredIdx === i;
        const d = data[i];
        const barH = Math.max(d.count > 0 ? 6 : 3, p.h);
        const x = p.x - barW / 2;
        const y = PAD_TOP + CHART_H - barH;

        return (
          <g
            key={i}
            onMouseEnter={() => onHover(i)}
            style={{ cursor: "default" }}
          >
            {d.count > 0 && (
              <text
                x={p.x}
                y={y - 4}
                textAnchor="middle"
                fill={isToday ? "var(--accent-light)" : "var(--text-muted)"}
                fontSize={9}
                fontWeight={700}
                fontFamily="'Space Mono', monospace"
              >
                {d.count}
              </text>
            )}
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={4}
              ry={4}
              fill={
                d.count === 0
                  ? "transparent"
                  : isToday
                    ? "url(#barGradToday)"
                    : isHov
                      ? "var(--accent)"
                      : "url(#barGrad)"
              }
              stroke={
                d.count === 0
                  ? "var(--border-medium)"
                  : isToday
                    ? "var(--accent-light)"
                    : isHov
                      ? "var(--accent-light)"
                      : "transparent"
              }
              strokeWidth={d.count === 0 ? 1 : isToday ? 1.5 : 0}
              strokeDasharray={d.count === 0 ? "3 2" : "0"}
              opacity={d.count === 0 ? 0.5 : 1}
            />
            {isToday && d.count > 0 && (
              <circle cx={p.x} cy={y} r={3} fill="var(--accent-light)" />
            )}
          </g>
        );
      })}
      <defs>
        <linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.85} />
          <stop offset="100%" stopColor="var(--accent-light)" stopOpacity={1} />
        </linearGradient>
        <linearGradient id="barGradToday" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
    </g>
  );
}

function BarChart({
  count, values, max, hoveredIdx, onHover, width, barGap = 4,
}: {
  count: number;
  values: number[];
  max: number;
  hoveredIdx: number | null;
  onHover: (i: number | null) => void;
  width: number;
  barGap?: number;
}) {
  const slotW = width / count;
  const barW = Math.max(2, slotW - barGap);

  return (
    <g>
      {values.map((v, i) => {
        const h = max > 0 ? (v / max) * CHART_H : 0;
        const barH = Math.max(v > 0 ? 4 : 2, h);
        const x = slotW * i + (slotW - barW) / 2;
        const y = PAD_TOP + CHART_H - barH;
        const isHov = hoveredIdx === i;
        const intensity = max > 0 ? v / max : 0;

        return (
          <g key={i} onMouseEnter={() => onHover(i)}>
            {v > 0 && count <= 7 && (
              <text
                x={x + barW / 2}
                y={y - 3}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize={8}
                fontFamily="'Space Mono', monospace"
              >
                {v}
              </text>
            )}
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={count <= 7 ? 3 : 1}
              fill={
                v === 0
                  ? "transparent"
                  : isHov
                    ? "var(--accent)"
                    : intensity > 0.65
                      ? "url(#barGrad)"
                      : intensity > 0.3
                        ? "var(--accent-border)"
                        : "rgba(124,58,237,0.25)"
              }
              stroke={v === 0 ? "var(--border-subtle)" : "none"}
              strokeWidth={0.5}
            />
          </g>
        );
      })}
    </g>
  );
}

export function buildLast7Days(
  history: { played_at: string; song_id: number }[],
  lang: Lang,
): Day7Entry[] {
  const dayLabels = getDayLabels(lang);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const t = lang === "id"
    ? { today: "Hari ini", yesterday: "Kemarin" }
    : { today: "Today", yesterday: "Yesterday" };

  const result: Day7Entry[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
    const plays = history.filter(h => {
      const ts = new Date(h.played_at).getTime();
      return ts >= dayStart.getTime() && ts <= dayEnd.getTime();
    });
    let label: string;
    if (i === 0) label = t.today;
    else if (i === 1) label = t.yesterday;
    else label = `${dayLabels[d.getDay()]} ${d.getDate()}`;
    result.push({
      date: d,
      label,
      count: plays.length,
      songIds: new Set(plays.map(h => h.song_id)),
    });
  }
  return result;
}
