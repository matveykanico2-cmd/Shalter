// MediaPipe Hands с jsdelivr — только когда в звонке включили «Жесты» (в сборку не входит).
const VERSION = "0.4.1646424915";
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${VERSION}`;

export type HandsResults = { multiHandLandmarks?: { x: number; y: number; z?: number }[][] };

export type HandsInstance = {
  setOptions(options: Record<string, unknown>): void;
  onResults(cb: (results: HandsResults) => void): void;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  close(): Promise<void>;
};

type HandsCtor = new (config: { locateFile: (file: string) => string }) => HandsInstance;

let loading: Promise<HandsCtor> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("Не удалось загрузить распознавание жестов"));
    };
    document.head.appendChild(script);
  });
}

function handsCtor() {
  loading ??= loadScript(`${BASE}/hands.js`)
    .then(() => {
      const ctor = (window as unknown as { Hands?: HandsCtor }).Hands;
      if (!ctor) throw new Error("Не удалось загрузить распознавание жестов");
      return ctor;
    })
    .catch((err: unknown) => {
      loading = null;
      throw err;
    });
  return loading;
}

/** Новый распознаватель рук; закрыть — close(). */
export async function createHands(): Promise<HandsInstance> {
  const Hands = await handsCtor();
  const hands = new Hands({ locateFile: (file) => `${BASE}/${file}` });
  hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
  return hands;
}
