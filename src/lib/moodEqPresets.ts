/**
 * moodEqPresets.ts — EQ gain presets per mood/time slot
 */

import type { TimeSlot } from "./moodEngine";

export const MOOD_EQ_PRESETS: Record<TimeSlot, { name: string; gains: number[] }> = {
  early_morning: { name: "Pagi Lembut", gains: [-1, 0, 1, 2, 1, 0, -1, -2, -2, -3] },
  morning:       { name: "Pagi Energik", gains: [2, 3, 2, 1, 0, 0, 1, 2, 1, 0] },
  afternoon:     { name: "Focus", gains: [-2, -1, 0, 1, 2, 2, 1, 0, -1, -2] },
  evening:       { name: "Evening Warm", gains: [1, 2, 2, 1, 0, -1, 0, 1, 2, 1] },
  night:         { name: "Malam Tenang", gains: [3, 2, 1, 0, -1, -1, 0, 1, 0, -1] },
  late_night:    { name: "Late Night Deep", gains: [4, 3, 1, 0, -2, -2, -1, 0, -1, -2] },
};

export function getEqPresetForHour(hour: number): { name: string; gains: number[] } {
  if (hour >= 5 && hour < 8) return MOOD_EQ_PRESETS.early_morning;
  if (hour >= 8 && hour < 12) return MOOD_EQ_PRESETS.morning;
  if (hour >= 12 && hour < 17) return MOOD_EQ_PRESETS.afternoon;
  if (hour >= 17 && hour < 21) return MOOD_EQ_PRESETS.evening;
  if (hour >= 21 && hour < 24) return MOOD_EQ_PRESETS.night;
  return MOOD_EQ_PRESETS.late_night;
}
