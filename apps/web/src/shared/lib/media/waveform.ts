// Осциллограмма голосового: уровни 0..1 за запись — в 64 целых 0..31, по пикам
// (packWaveform в public/js/lib/waveform.js).
export const WAVEFORM_POINTS = 64;
const MAX_LEVEL = 31;

export function packWaveform(levels: readonly number[]) {
  if (!levels.length) return undefined;
  const out: number[] = [];
  const step = levels.length / WAVEFORM_POINTS;
  for (let i = 0; i < WAVEFORM_POINTS; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j]!);
    out.push(peak);
  }
  const max = Math.max(...out) || 1;
  return out.map((v) => Math.round((v / max) * MAX_LEVEL));
}
