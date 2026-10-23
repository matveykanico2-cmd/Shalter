import { vi } from "vitest";

/** Подмена микрофона и MediaRecorder: запись «идёт», stop() отдаёт один кусок данных. */
export class FakeMediaRecorder {
  public static instances: FakeMediaRecorder[] = [];
  public static isTypeSupported = (t: string) => t.startsWith("audio/webm") || t.startsWith("video/webm");
  public state: "inactive" | "recording" | "paused" = "inactive";
  public mimeType: string;
  public ondataavailable: ((e: { data: Blob }) => void) | null = null;
  public onstop: (() => void) | null = null;

  public constructor(
    public readonly stream: unknown,
    opts?: { mimeType?: string }
  ) {
    this.mimeType = opts?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }

  public start() {
    this.state = "recording";
  }
  public pause() {
    this.state = "paused";
  }
  public resume() {
    this.state = "recording";
  }
  public stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

export function fakeMedia() {
  FakeMediaRecorder.instances = [];
  const track = { stop: vi.fn(), kind: "audio" };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] };
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  return { getUserMedia, track };
}
