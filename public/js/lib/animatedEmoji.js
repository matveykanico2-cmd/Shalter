import { renderLottie } from "./lottie.js";

// Анимированные эмодзи (реакции, сообщения из 1–3 эмодзи), как в Telegram.
// Анимации — Noto Animated Emoji от Google (CC BY 4.0), лежат в public/tgs/emoji.
const AVAILABLE = new Set(["1f308", "1f31f", "1f339", "1f355", "1f37e", "1f381", "1f382", "1f388", "1f389", "1f38a", "1f3c6", "1f431", "1f440", "1f44a", "1f44b", "1f44c", "1f44d", "1f44e", "1f44f", "1f451", "1f47b", "1f47d", "1f480", "1f48b", "1f48e", "1f490", "1f494", "1f496", "1f498", "1f499", "1f49a", "1f49b", "1f49c", "1f4a5", "1f4a9", "1f4aa", "1f4ab", "1f4af", "1f525", "1f5a4", "1f600", "1f601", "1f602", "1f603", "1f604", "1f605", "1f606", "1f607", "1f608", "1f609", "1f60a", "1f60b", "1f60c", "1f60d", "1f60e", "1f60f", "1f610", "1f612", "1f614", "1f615", "1f618", "1f61b", "1f61c", "1f61d", "1f61e", "1f620", "1f621", "1f622", "1f624", "1f628", "1f62c", "1f62d", "1f62e", "1f62e_200d_1f4a8", "1f62f", "1f630", "1f631", "1f632", "1f633", "1f634", "1f635", "1f636_200d_1f32b", "1f637", "1f63b", "1f642", "1f643", "1f644", "1f648", "1f649", "1f64a", "1f64c", "1f64f", "1f680", "1f90d", "1f910", "1f911", "1f913", "1f914", "1f916", "1f917", "1f918", "1f919", "1f91d", "1f91e", "1f91f", "1f920", "1f921", "1f922", "1f923", "1f924", "1f927", "1f929", "1f92a", "1f92b", "1f92c", "1f92d", "1f92e", "1f92f", "1f942", "1f970", "1f971", "1f973", "1f974", "1f975", "1f976", "1f979", "1f97a", "1f984", "1f9d0", "1f9e1", "1fae1", "1faf6", "2615", "26a1", "26bd", "270a", "270c", "2728", "2744", "2764", "2b50"]);

export function emojiCode(emoji) {
  return [...String(emoji ?? "")]
    .map((c) => c.codePointAt(0).toString(16))
    .filter((h) => h !== "fe0f")
    .join("_");
}

export function hasAnimatedEmoji(emoji) {
  return AVAILABLE.has(emojiCode(emoji));
}

/**
 * replay: true — играет при появлении; false — стоит на последнем кадре и оживает по наведению.
 */
export function renderAnimatedEmoji(emoji, { size = 32, replay = false, loop = false } = {}) {
  const code = emojiCode(emoji);
  if (!AVAILABLE.has(code)) return document.createTextNode(emoji);
  const fallback = () => {
    const s = document.createElement("span");
    s.textContent = emoji;
    return s;
  };
  const box = renderLottie(`emoji/${code}`, { size, replay, loop, fallback, rest: "first" });
  box.classList.add("animated-emoji");
  box.setAttribute("aria-label", emoji);
  return box;
}
