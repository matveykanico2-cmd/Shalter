import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MESSAGE_SOUNDS, playSentSound, previewSound, RINGTONES } from "./sounds";

// Подмена WebAudio: записываем, какие ноты (частота, скольжение, форма волны) запланированы.
type Note = { freq: number; glide: number | null; type: string; at: number };
let notes: Note[] = [];

class FakeAudioContext {
  public state = "running";
  public currentTime = 0;
  public destination = {};
  public resume = () => Promise.resolve();
  public createOscillator() {
    const note: Note = { freq: 0, glide: null, type: "sine", at: 0 };
    return {
      set type(t: string) {
        note.type = t;
      },
      frequency: {
        setValueAtTime: (f: number, at: number) => Object.assign(note, { freq: f, at }),
        exponentialRampToValueAtTime: (f: number) => void (note.glide = f),
      },
      connect: (g: unknown) => g,
      start: () => void notes.push(note),
      stop: () => {},
    };
  }
  public createGain() {
    return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d };
  }
}

beforeEach(() => {
  notes = [];
  vi.stubGlobal("AudioContext", FakeAudioContext);
});
afterEach(() => vi.unstubAllGlobals());

const freqs = () => notes.map((n) => Math.round(n.freq * 100) / 100);

describe("звуки (как ringtone.js в main2)", () => {
  it("в списке звуков сообщения есть «Арфа» и «Мягкий», в рингтонах — «Колокольчик»", () => {
    expect(MESSAGE_SOUNDS.map((s) => s.label)).toEqual(["Классика", "Капля", "Пузырь", "Колокольчик", "Аккорд", "Арфа", "Мягкий", "Ретро", "Без звука"]);
    expect(RINGTONES.map((s) => s.label)).toEqual(["Классика", "Мелодия", "Маримба", "Ретро", "Нежный", "Колокольчик"]);
    expect(RINGTONES.find((r) => r.id === "bell")?.cycle).toBe(2.5);
  });

  it("«Арфа» — арпеджио от 523 Гц треугольной волной", () => {
    previewSound("message", "harp");
    expect(freqs()).toEqual([523, 653.75, 784.5, 1046]);
    expect(notes.every((n) => n.type === "triangle")).toBe(true);
  });

  it("«Мягкий» — 659 → 880 Гц", () => {
    previewSound("message", "soft");
    expect(freqs()).toEqual([659, 880]);
  });

  it("«Капля» — мягкое скольжение 1400 → 840 Гц", () => {
    previewSound("message", "drop");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ freq: 1400, glide: 840 });
  });

  it("рингтон «Колокольчик» — колокол на 659 Гц с обертонами", () => {
    previewSound("ringtone", "bell");
    expect(freqs()).toEqual([659, 1324.59, 1990.18]);
  });

  it("«Отправлено» — 880 → 1320 Гц", () => {
    playSentSound();
    expect(freqs()).toEqual([880, 1320]);
  });
});
