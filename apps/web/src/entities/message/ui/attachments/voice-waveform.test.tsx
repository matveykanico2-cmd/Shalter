import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDecodedWaveforms } from "@/shared/lib/media/waveform";

import type { Attachment } from "../../model/attachment";
import type { FeedMessage } from "../../model/types";

import { VoicePlayer } from "./voice-player";

const msg = (id: string) => ({ id, chatId: "c1", type: "text", text: "", createdAt: new Date().toISOString() }) as FeedMessage;
const heights = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[role=slider] > span")].map((s) => s.style.getPropertyValue("--h"));

let observers: { cb: IntersectionObserverCallback; el: Element | null }[] = [];
const showAll = () =>
  act(async () => {
    for (const o of observers) if (o.el) o.cb([{ isIntersecting: true, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver);
    await new Promise((r) => setTimeout(r, 0));
  });

describe("голосовое без сохранённой осциллограммы", () => {
  // Тихо, потом громко.
  const samples = new Float32Array(1024).map((_, i) => (i < 512 ? 0.1 : 0.5));
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDecodedWaveforms();
    sessionStorage.clear();
    observers = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        private o: { cb: IntersectionObserverCallback; el: Element | null };
        constructor(cb: IntersectionObserverCallback) {
          this.o = { cb, el: null };
          observers.push(this.o);
        }
        observe(el: Element) {
          this.o.el = el;
        }
        disconnect() {
          this.o.el = null;
        }
        unobserve() {}
      }
    );
    vi.stubGlobal(
      "OfflineAudioContext",
      class {
        decodeAudioData = async () => ({ getChannelData: () => samples });
      }
    );
    fetchMock = vi.fn(async () => new Response(new Uint8Array([1])));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("считается из файла, только когда пузырь виден", async () => {
    const a: Attachment = { kind: "voice", url: "/uploads/old_0000000000000001.ogg", durationSec: 3 };
    const { container } = render(<VoicePlayer attachment={a} message={msg("m-old")} senderName="Боб" />);
    expect(new Set(heights(container))).toEqual(new Set(["0.120"]));
    expect(fetchMock).not.toHaveBeenCalled();

    await showAll();
    expect(fetchMock).toHaveBeenCalledWith(a.url, { credentials: "include" });
    const h = heights(container);
    expect(h[0]).toBe("0.194");
    expect(h.at(-1)).toBe("1.000");
  });

  it("не вышло — остаются ровные столбики", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const a: Attachment = { kind: "voice", url: "/uploads/old_0000000000000002.ogg", durationSec: 3 };
    const { container } = render(<VoicePlayer attachment={a} message={msg("m-fail")} senderName="Боб" />);
    await showAll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Set(heights(container))).toEqual(new Set(["0.120"]));
  });

  it("сохранённая осциллограмма — файл не запрашивается", async () => {
    const a: Attachment = { kind: "voice", url: "/uploads/new_0000000000000003.ogg", durationSec: 3, waveform: Array(64).fill(31) };
    const { container } = render(<VoicePlayer attachment={a} message={msg("m-new")} senderName="Боб" />);
    await showAll();
    expect(observers).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(new Set(heights(container))).toEqual(new Set(["1.000"]));
  });
});
