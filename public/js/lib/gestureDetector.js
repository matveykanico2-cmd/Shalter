// Gesture detection for video calls using MediaPipe Hands
// Detects: thumbs up, heart, peace, clap, etc.

const GESTURE_MODELS = {
  hands: "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915",
};

const GESTURES = {
  THUMBS_UP: "thumbs_up",
  HEART: "heart",
  PEACE: "peace",
  CLAP: "clap",
  OK: "ok",
  ROCK: "rock",
};

const GESTURE_SCENES = {
  [GESTURES.THUMBS_UP]: "thumbs_pop",
  [GESTURES.HEART]: "heart_beat",
  [GESTURES.PEACE]: "music_notes",
  [GESTURES.CLAP]: "clap_hands",
  [GESTURES.OK]: "crown_shine",
  [GESTURES.ROCK]: "fire_burn",
};

let hands = null;
let isModelLoaded = false;
let loadPromise = null;

async function loadMediaPipeHands() {
  if (isModelLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // Load MediaPipe Hands script dynamically
      await loadScript(GESTURE_MODELS.hands);

      if (typeof window.Hands === "undefined") {
        throw new Error("MediaPipe Hands not loaded");
      }

      hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`,
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });

      isModelLoaded = true;
    } catch (err) {
      console.error("[gestureDetector] Failed to load MediaPipe Hands:", err);
      isModelLoaded = false;
      loadPromise = null;
      throw err;
    }
  })();

  return loadPromise;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function getFingerStates(landmarks) {
  // MediaPipe hand landmarks indices:
  // Thumb: 1,2,3,4 | Index: 5,6,7,8 | Middle: 9,10,11,12 | Ring: 13,14,15,16 | Pinky: 17,18,19,20
  const tips = [4, 8, 12, 16, 20];
  const pips = [3, 6, 10, 14, 18];
  const mcps = [2, 5, 9, 13, 17];

  const fingers = [];
  for (let i = 0; i < 5; i++) {
    const tip = landmarks[tips[i]];
    const pip = landmarks[pips[i]];
    const mcp = landmarks[mcps[i]];

    if (i === 0) {
      // Thumb: compare x coordinates (horizontal)
      const isExtended = Math.abs(tip.x - mcp.x) > Math.abs(pip.x - mcp.x) * 0.5;
      fingers.push(isExtended);
    } else {
      // Other fingers: compare y coordinates (vertical)
      const isExtended = tip.y < pip.y - 0.02;
      fingers.push(isExtended);
    }
  }
  return fingers; // [thumb, index, middle, ring, pinky]
}

function recognizeGesture(landmarks) {
  const fingers = getFingerStates(landmarks);
  const [thumb, index, middle, ring, pinky] = fingers;

  // Distance helpers
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const ringMcp = landmarks[13];
  const pinkyMcp = landmarks[17];

  // Thumbs up: thumb extended, others folded
  if (thumb && !index && !middle && !ring && !pinky) {
    return GESTURES.THUMBS_UP;
  }

  // Heart: thumb and index form a heart shape (tips close together, others folded)
  if (thumb && index && !middle && !ring && !pinky) {
    const d = dist(thumbTip, indexTip);
    if (d < 0.08) return GESTURES.HEART;
  }

  // Peace: index and middle extended, others folded
  if (!thumb && index && middle && !ring && !pinky) {
    return GESTURES.PEACE;
  }

  // Clap: both hands open, palms facing each other (detected via both hands)
  // Single hand: all fingers extended (open palm)
  if (thumb && index && middle && ring && pinky) {
    // Could be clap (need two hands) or just open hand
    return GESTURES.CLAP;
  }

  // OK sign: thumb and index touching, others extended
  if (!thumb && !index && middle && ring && pinky) {
    const d = dist(thumbTip, indexTip);
    if (d < 0.06) return GESTURES.OK;
  }

  // Rock: index and pinky extended, others folded
  if (!thumb && index && !middle && !ring && pinky) {
    return GESTURES.ROCK;
  }

  return null;
}

export class GestureDetector {
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.canvas = null;
    this.ctx = null;
    this.onGesture = options.onGesture || (() => {});
    this.onResults = options.onResults || (() => {});
    this.running = false;
    this.lastGesture = null;
    this.gestureCooldown = 0;
    this.cooldownMs = options.cooldownMs || 2000; // 2 second cooldown between gestures
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
  }

  async start() {
    if (this.running) return;
    await loadMediaPipeHands();
    if (!hands) throw new Error("MediaPipe Hands not available");

    this.running = true;

    // Create canvas for processing
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;
    this.ctx = this.canvas.getContext("2d");

    hands.onResults((results) => this.handleResults(results));

    this.processLoop();
  }

  stop() {
    this.running = false;
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
      this.ctx = null;
    }
  }

  async processLoop() {
    while (this.running && this.video.readyState === 4) {
      try {
        await hands.send({ image: this.video });
      } catch (err) {
        console.error("[gestureDetector] Processing error:", err);
      }
      // Process at ~10fps to save CPU
      await new Promise((r) => setTimeout(r, 100));
    }
    if (this.running) this.processLoop();
  }

  handleResults(results) {
    this.onResults(results);

    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      this.lastGesture = null;
      return;
    }

    // Check each hand for gestures
    for (const landmarks of results.multiHandLandmarks) {
      const gesture = recognizeGesture(landmarks);
      if (gesture && gesture !== this.lastGesture) {
        const now = Date.now();
        if (now - this.gestureCooldown > this.cooldownMs) {
          this.lastGesture = gesture;
          this.gestureCooldown = now;
          this.onGesture(gesture, landmarks);
        }
      }
    }
  }

  // Get the scene name for a gesture
  static getSceneForGesture(gesture) {
    return GESTURE_SCENES[gesture] || null;
  }

  // Check if MediaPipe is available
  static isAvailable() {
    return isModelLoaded || typeof window.Hands !== "undefined";
  }
}

export const GESTURE_NAMES = {
  [GESTURES.THUMBS_UP]: "👍 Лайк",
  [GESTURES.HEART]: "❤️ Сердце",
  [GESTURES.PEACE]: "✌️ Пиース",
  [GESTURES.CLAP]: "👏 Клап",
  [GESTURES.OK]: "👌 Ок",
  [GESTURES.ROCK]: "🤘 Рок",
};