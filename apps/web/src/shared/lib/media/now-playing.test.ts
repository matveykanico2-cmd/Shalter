import { describe, expect, it } from "vitest";

import { audioFor } from "./now-playing";

describe("audioFor", () => {
  it("голосовое — метаданные сразу, музыка — только по нажатию; второй раз — тот же элемент", () => {
    expect(audioFor("m_1:/uploads/v", "/uploads/v").preload).toBe("metadata");
    const track = audioFor("m_2:/uploads/a", "/uploads/a", "none");
    expect(track.preload).toBe("none");
    expect(audioFor("m_2:/uploads/a", "/uploads/a", "none")).toBe(track);
  });
});
