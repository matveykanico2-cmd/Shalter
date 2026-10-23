import { describe, expect, it } from "vitest";

import { packWaveform, WAVEFORM_POINTS } from "./waveform";

describe("осциллограмма голосового (packWaveform)", () => {
  it("64 пика 0..31, громкий кусок — 31", () => {
    const levels = [...Array(64).fill(0.1), ...Array(64).fill(0.5)];
    const wave = packWaveform(levels)!;
    expect(wave).toHaveLength(WAVEFORM_POINTS);
    expect(wave[0]).toBe(6);
    expect(wave.at(-1)).toBe(31);
    expect(packWaveform([])).toBeUndefined();
  });
});
