// Движок анимаций старого клиента: сцены, персонажи, рисунки, Lottie, свои эмодзи.
// Функции строят DOM-узлы; в React их ставит shared/ui/DomNode.
import "./anim.css";

export { emojiCode, hasAnimatedEmoji, renderAnimatedEmoji, showReactionBurst } from "./animated-emoji";
export { type CustomScene, renderCustomScene, sanitizeCustomScene, sceneSummaryEmoji } from "./custom-scene";
export { emojiArtName, lottieNameFor, type LottieOptions, renderEmojiArt, renderLottie } from "./lottie";
export { DRAWN_STICKERS, getSticker, renderSticker, type Sticker, STICKERS } from "./stickers";
